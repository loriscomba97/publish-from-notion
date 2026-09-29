import assert from 'node:assert/strict';
import { it } from 'node:test';
import { safeHref, safeSrc } from '../src/lib/notion/util';
import { handleNotionWebhook } from '../src/lib/notion/webhooks';
import { serveNotionImage, signImagePath } from '../src/lib/notion/images';
import { fetchBlockTree } from '../src/lib/notion/blocks';
import { mockClient, uuid } from './helpers';
import type { NotionBlock } from '../src/lib/notion/types';

it('rejects browser-normalized authority escapes and control characters', () => {
  for (const value of ['/\\example.com/image', '/\t/example.com', 'https://example.com/\nfile']) {
    assert.equal(safeHref(value), null);
    assert.equal(safeSrc(value), null);
  }
});
it('does not log a handshake token by default and rejects multiline tokens', async () => {
  const logs: string[] = [];
  const request = (token: string) => new Request('https://example.com', { method: 'POST', body: JSON.stringify({ verification_token: token }) });
  await handleNotionWebhook(request('setup-token'), { log: m => logs.push(m) });
  assert.equal(logs.length, 0);
  const result = await handleNotionWebhook(request('bad\nentry'), { allowVerificationLogs: true, log: m => logs.push(m) });
  assert.equal(!result.ok && result.status, 400);
  assert.equal(logs.length, 0);
});
it('refuses untrusted image hosts without making an upstream request', async () => {
  for (const url of ['http://127.0.0.1/a.png', 'https://file.notion.so.attacker.example/a.png', 'https://s3.amazonaws.com/other-bucket/a.png']) {
    const id = uuid(800);
    const block = { object: 'block', id, type: 'image', has_children: false, image: { type: 'file', file: { url } } } as NotionBlock;
    const path = await signImagePath({ kind: 'block', id }, 'v1', { key: 'test', basePath: '/image' });
    const response = await serveNotionImage(path.slice(7).split('/'), { client: mockClient({ blocks: [block] }), key: 'test', fetch: async () => { throw new Error('must not fetch'); } });
    assert.equal(response.status, 502);
  }
});
it('disables automatic redirects on image downloads', async () => {
  const id = uuid(801);
  const block = { object: 'block', id, type: 'image', has_children: false, image: { type: 'file', file: { url: 'https://file.notion.so/f/image.png' } } } as NotionBlock;
  const path = await signImagePath({ kind: 'block', id }, 'v1', { key: 'test', basePath: '/image' });
  let redirect: RequestRedirect | undefined;
  const response = await serveNotionImage(path.slice(7).split('/'), { client: mockClient({ blocks: [block] }), key: 'test', fetch: async (_url, init) => { redirect = init?.redirect; return new Response(null, { status: 302 }); } });
  assert.equal(redirect, 'error');
  assert.equal(response.status, 502);
});
it('fails rather than silently dropping blocks at the nesting limit', async () => {
  const client = mockClient({});
  client.listBlockChildren = async () => [{ object: 'block', id: uuid(802), type: 'toggle', has_children: true } as NotionBlock];
  await assert.rejects(fetchBlockTree(client, uuid(803), { maxDepth: 1 }), /nesting/);
});

import { renderBlocks } from '../src/lib/notion/render';
it('removes private workspace targets from bookmarks and whitespace-prefixed links', () => {
  const url = `https://app.notion.com/p/${uuid(804).replace(/-/g, '')}`;
  const nodes = [
    { block: { object: 'block', id: uuid(), type: 'bookmark', has_children: false, bookmark: { url, caption: [] } } as NotionBlock, children: [] },
    { block: { object: 'block', id: uuid(), type: 'paragraph', has_children: false, paragraph: { rich_text: [{ type: 'text', plain_text: 'Internal', href: ` ${url} ` }] } } as NotionBlock, children: [] },
  ];
  const result = renderBlocks(nodes);
  assert.ok(!result.html.includes('notion.com'));
  assert.ok(result.html.includes('Internal'));
});
