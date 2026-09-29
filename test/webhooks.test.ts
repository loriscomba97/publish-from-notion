import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TAGS } from '../src/lib/notion/tags';
import { hmacSha256, toHex } from '../src/lib/notion/util';
import { handleNotionWebhook, webhookResponse, type WebhookOptions } from '../src/lib/notion/webhooks';
import { uuid } from './helpers';

const SECRET = 'automation-secret-for-tests';
const TOKEN = 'verification-token-for-tests';
const options: WebhookOptions = { automationSecret: SECRET, verificationToken: TOKEN, log: () => {} };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://www.example.com/api/notion-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const signed = async (body: unknown, token = TOKEN) => {
  const raw = JSON.stringify(body);
  return post(raw, { 'x-notion-signature': `sha256=${toHex(await hmacSha256(token, raw))}` });
};

const pageId = uuid(400);
/** Shape of a database automation "Send webhook" payload: the page travels under `data`. */
const automationBody = { source: { type: 'automation', attempt: 1 }, data: { object: 'page', id: pageId, properties: {} } };
const integrationEvent = (type: string, parentType = 'data_source') => ({
  id: uuid(),
  type,
  timestamp: '2026-09-01T10:00:00.000Z',
  entity: { id: pageId, type: 'page' },
  data: { parent: { id: uuid(), type: parentType }, updated_properties: ['abc'] },
});

describe('automation webhooks (paid plans)', () => {
  it('accepts the secret header and purges the list and the edited page', async () => {
    const outcome = await handleNotionWebhook(post(automationBody, { 'x-webhook-secret': SECRET }), options);
    assert.deepEqual(outcome, { ok: true, action: 'revalidate', via: 'automation', event: undefined, pageId, tags: [TAGS.posts, TAGS.page(pageId)] });
  });

  it('also accepts Authorization: Bearer', async () => {
    const outcome = await handleNotionWebhook(post(automationBody, { authorization: `Bearer ${SECRET}` }), options);
    assert.equal(outcome.ok && outcome.action, 'revalidate');
  });

  it('purges everything when the payload names no page (a manual trigger)', async () => {
    const outcome = await handleNotionWebhook(post('', { 'x-webhook-secret': SECRET }), options);
    assert.deepEqual(outcome.ok && outcome.action === 'revalidate' && outcome.tags, [TAGS.all]);
  });

  it('fails closed: wrong secret, no secret, or no secret configured', async () => {
    for (const [request, opts] of [
      [post(automationBody, { 'x-webhook-secret': 'wrong' }), options],
      [post(automationBody), options],
      [post(automationBody, { 'x-webhook-secret': SECRET }), { ...options, automationSecret: undefined }],
    ] as const) {
      const outcome = await handleNotionWebhook(request, opts);
      assert.equal(outcome.ok, false);
      assert.equal(!outcome.ok && outcome.status, 401);
    }
  });
});

describe('integration webhooks (any plan)', () => {
  it('verifies the signature and purges the page', async () => {
    const outcome = await handleNotionWebhook(await signed(integrationEvent('page.properties_updated')), options);
    assert.deepEqual(outcome.ok && outcome.action === 'revalidate' && outcome.tags, [TAGS.posts, TAGS.page(pageId)]);
  });

  it('rejects bad signatures, and signed events when no token is configured', async () => {
    const forged = await handleNotionWebhook(await signed(integrationEvent('page.content_updated'), 'another-token'), options);
    assert.equal(!forged.ok && forged.status, 401);
    const unconfigured = await handleNotionWebhook(await signed(integrationEvent('page.content_updated')), { ...options, verificationToken: undefined });
    assert.equal(!unconfigured.ok && unconfigured.status, 401);
  });

  it('ignores events that cannot change a post', async () => {
    const locked = await handleNotionWebhook(await signed(integrationEvent('page.locked')), options);
    assert.equal(locked.ok && locked.action, 'ignored');
    const workspacePage = await handleNotionWebhook(await signed(integrationEvent('page.content_updated', 'space')), options);
    assert.equal(workspacePage.ok && workspacePage.action, 'ignored');
    const comment = await handleNotionWebhook(await signed({ ...integrationEvent('comment.created'), entity: { id: uuid(), type: 'comment' } }), options);
    assert.equal(comment.ok && comment.action, 'ignored');
  });

  it('purges everything on data source changes such as a renamed property', async () => {
    const outcome = await handleNotionWebhook(await signed({ ...integrationEvent('data_source.schema_updated'), entity: { id: uuid(), type: 'data_source' } }), options);
    assert.deepEqual(outcome.ok && outcome.action === 'revalidate' && outcome.tags, [TAGS.all]);
  });

  it('logs the one-time verification token only while none is configured', async () => {
    const logs: string[] = [];
    const first = await handleNotionWebhook(post({ verification_token: 'token-from-notion' }), { ...options, verificationToken: undefined, allowVerificationLogs: true, log: (m) => logs.push(m) });
    assert.deepEqual(first, { ok: true, action: 'verification' });
    assert.match(logs[0] ?? '', /token-from-notion/);
    await handleNotionWebhook(post({ verification_token: 'another-token' }), { ...options, log: (m) => logs.push(m) });
    assert.doesNotMatch(logs[1] ?? '', /another-token/);
  });

  it('recognizes the handshake even when it carries a signature header', async () => {
    const logs: string[] = [];
    const request = post({ verification_token: 'token-from-notion' }, { 'x-notion-signature': 'sha256=whatever' });
    const outcome = await handleNotionWebhook(request, { ...options, verificationToken: undefined, allowVerificationLogs: true, log: (m) => logs.push(m) });
    assert.deepEqual(outcome, { ok: true, action: 'verification' });
    assert.match(logs[0] ?? '', /Token: token-from-notion$/);
  });

  it('still recognizes the handshake if Notion adds fields to it', async () => {
    const outcome = await handleNotionWebhook(post({ verification_token: 'token-from-notion', attempt_number: 1 }), { ...options, verificationToken: undefined });
    assert.deepEqual(outcome, { ok: true, action: 'verification' });
  });
});

describe('request hygiene and responses', () => {
  it('rejects bodies that are not JSON or too large', async () => {
    const notJson = await handleNotionWebhook(post('{nope', { 'x-webhook-secret': SECRET }), options);
    assert.equal(!notJson.ok && notJson.status, 400);
    const huge = await handleNotionWebhook(post('x'.repeat(1_000_001), { 'x-webhook-secret': SECRET }), options);
    assert.equal(!huge.ok && huge.status, 413);
  });

  it('stops reading a streamed body as soon as it passes the limit', async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const request = new Request('https://www.example.com/api/notion-webhook', { method: 'POST', body: endless, duplex: 'half' } as RequestInit);
    const outcome = await handleNotionWebhook(request, options);
    assert.equal(!outcome.ok && outcome.status, 413);
    assert.ok(pulled < 40, `read ${pulled} chunks`);
  });

  it('answers with JSON, never cached', async () => {
    const ok = webhookResponse({ ok: true, action: 'revalidate', via: 'automation', tags: [TAGS.all] });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ok.json(), { ok: true, action: 'revalidate', revalidated: [TAGS.all] });
    const denied = webhookResponse({ ok: false, status: 401, reason: 'missing or wrong secret' });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { ok: false, error: 'missing or wrong secret' });
  });
});
