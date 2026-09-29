import { TAGS } from './tags';
import { constantTimeEqual, hmacSha256, isRecord, normalizeNotionId, secretsMatch, toHex } from './util';

/**
 * One endpoint for both ways Notion can tell your site that something changed.
 *
 * 1. Database automations (paid Notion plans): "When Published is checked → Send webhook", with a
 *    custom header `X-Webhook-Secret: <NOTION_AUTOMATION_SECRET>`. Arrives in a few seconds.
 * 2. Connection webhooks (the Webhooks tab of the connection in the Developer portal, no automation needed): every
 *    event is signed with HMAC-SHA256 using the subscription's verification token, sent in
 *    `X-Notion-Signature`. Arrives within about a minute and also fires on text edits.
 *
 * Both fail closed: without a configured secret or token, nothing is accepted. The result says
 * which cache tags to purge; the route decides how (revalidateTag in Next.js).
 */

export type WebhookOptions = {
  /** Shared secret the Notion automation sends in `X-Webhook-Secret` (or `Authorization: Bearer`). */
  automationSecret?: string;
  /** Verification token of the integration webhook subscription. */
  verificationToken?: string;
  log?: (message: string) => void;
};

export type WebhookOutcome =
  | { ok: true; action: 'revalidate'; tags: string[]; via: 'automation' | 'integration'; event?: string; pageId?: string }
  | { ok: true; action: 'ignored'; reason: string }
  | { ok: true; action: 'verification' }
  | { ok: false; status: 400 | 401 | 413; reason: string };

const MAX_BODY = 1_000_000;

/** Parent types of pages that cannot be blog posts: workspace pages, sub-pages, blocks. */
const NOT_A_ROW = new Set(['space', 'workspace', 'page', 'page_id', 'block', 'block_id']);

/** Checks `X-Notion-Signature: sha256=<hex>` against the raw body. */
export async function verifyNotionSignature(rawBody: string, header: string, verificationToken: string): Promise<boolean> {
  if (!verificationToken) return false;
  const provided = header.trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = toHex(await hmacSha256(verificationToken, rawBody));
  return constantTimeEqual(provided, expected);
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function revalidate(via: 'automation' | 'integration', pageId: string | null, event?: string): WebhookOutcome {
  return pageId
    ? { ok: true, action: 'revalidate', via, event, pageId, tags: [TAGS.posts, TAGS.page(pageId)] }
    : { ok: true, action: 'revalidate', via, event, tags: [TAGS.all] };
}

function fromIntegrationEvent(body: Record<string, unknown>): WebhookOutcome {
  const event = text(body.type);
  const entity = isRecord(body.entity) ? body.entity : {};
  const data = isRecord(body.data) ? body.data : {};
  const parent = isRecord(data.parent) ? data.parent : {};

  if (event.startsWith('page.')) {
    if (event === 'page.locked' || event === 'page.unlocked') return { ok: true, action: 'ignored', reason: `event ${event}` };
    if (NOT_A_ROW.has(text(parent.type))) return { ok: true, action: 'ignored', reason: 'page is not a database row' };
    return revalidate('integration', normalizeNotionId(text(entity.id)), event);
  }
  // Data source or database level changes (a renamed property, bulk edits): purge everything.
  if (event.startsWith('data_source.') || event.startsWith('database.')) return revalidate('integration', null, event);
  return { ok: true, action: 'ignored', reason: event ? `event ${event}` : 'no event type' };
}

/** The automation payload carries the page; look for its id where Notion and people put it. */
function pageIdFromAutomation(body: Record<string, unknown>): string | null {
  const data = isRecord(body.data) ? body.data : {};
  const entity = isRecord(body.entity) ? body.entity : {};
  const page = isRecord(body.page) ? body.page : {};
  for (const candidate of [data.id, entity.id, page.id, body.page_id, body.pageId]) {
    const id = normalizeNotionId(text(candidate));
    if (id) return id;
  }
  return null;
}

/** Reads the body as text, giving up (null) as soon as it grows past `limit` bytes. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function handleNotionWebhook(request: Request, options: WebhookOptions): Promise<WebhookOutcome> {
  const log = options.log ?? ((message: string) => console.warn(`[notion webhook] ${message}`));
  const raw = await readBody(request, MAX_BODY);
  if (raw === null) return { ok: false, status: 413, reason: 'payload too large' };

  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, status: 400, reason: 'body is not JSON' };
    }
  }
  const payload = isRecord(body) ? body : {};

  // One-time handshake when a webhook subscription is created in the Developer portal: a token
  // and no event type. Checked before signatures, so it is recognized whatever headers it carries.
  // It never triggers anything: at most it prints the token while none is configured.
  if (typeof payload.verification_token === 'string' && payload.type === undefined) {
    if (options.verificationToken) {
      log('received a verification request, but a verification token is already configured: ignored.');
    } else {
      log(
        'Notion sent the verification token for your webhook subscription. Paste it in the Developer portal ' +
          '(your connection > Webhooks > Verify) and save it as NOTION_WEBHOOK_VERIFICATION_TOKEN. ' +
          `Token: ${payload.verification_token}`,
      );
    }
    return { ok: true, action: 'verification' };
  }

  const signature = request.headers.get('x-notion-signature');
  if (signature) {
    if (!options.verificationToken) return { ok: false, status: 401, reason: 'signed event received but no verification token is configured' };
    if (!(await verifyNotionSignature(raw, signature, options.verificationToken))) return { ok: false, status: 401, reason: 'invalid signature' };
    return fromIntegrationEvent(payload);
  }

  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const provided = request.headers.get('x-webhook-secret') ?? bearer;
  if (!options.automationSecret || !(await secretsMatch(provided.trim(), options.automationSecret))) {
    return { ok: false, status: 401, reason: 'missing or wrong secret' };
  }
  return revalidate('automation', pageIdFromAutomation(payload));
}

/** JSON response for a webhook outcome. Errors say as little as possible. */
export function webhookResponse(outcome: WebhookOutcome): Response {
  const headers = { 'Cache-Control': 'no-store' };
  if (!outcome.ok) return Response.json({ ok: false, error: outcome.reason }, { status: outcome.status, headers });
  const { ok, action } = outcome;
  const extra = outcome.action === 'revalidate' ? { revalidated: outcome.tags } : outcome.action === 'ignored' ? { reason: outcome.reason } : {};
  return Response.json({ ok, action, ...extra }, { status: 200, headers });
}
