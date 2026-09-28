import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imageSourceUrl, imageVersion, serveNotionImage, signImagePath, verifyImagePath } from '../src/lib/notion/images';
import type { NotionBlock } from '../src/lib/notion/types';
import { mockClient, page, prop, scriptedFetch, uuid } from './helpers';

const KEY = 'test-signing-key';
const basePath = '/notion-image';
/** Path segments after the base path, decoded the way a router hands them over. */
const segmentsOf = (path: string) => path.slice(basePath.length + 1).split('/').map(decodeURIComponent);

describe('signed image paths', () => {
  it('round-trips block, cover and files-property references', async () => {
    const id = uuid(300);
    const refs = [
      { kind: 'block' as const, id },
      { kind: 'cover' as const, id },
      { kind: 'property' as const, id, property: 'X%40b', index: 2 },
    ];
    for (const ref of refs) {
      const path = await signImagePath(ref, 'v1', { key: KEY, basePath });
      assert.ok(path.startsWith(`${basePath}/`));
      const verified = await verifyImagePath(segmentsOf(path), KEY);
      assert.deepEqual(verified, { ref: { ...ref, id: id.replace(/-/g, '') }, version: 'v1' });
    }
  });

  it('rejects tampering, another key and malformed paths', async () => {
    const path = await signImagePath({ kind: 'block', id: uuid(301) }, 'v1', { key: KEY, basePath });
    const segments = segmentsOf(path);
    const signature = segments.at(-1) ?? '';
    const flipped = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    assert.equal(await verifyImagePath([...segments.slice(0, -1), flipped], KEY), null);
    assert.equal(await verifyImagePath([...segments.slice(0, -2), 'v2', signature], KEY), null);
    assert.equal(await verifyImagePath(segments, 'another-key'), null);
    assert.equal(await verifyImagePath(['x', 'y'], KEY), null);
    assert.equal(await verifyImagePath(segments, ''), null);
  });

  it('requires a key to sign', async () => {
    await assert.rejects(signImagePath({ kind: 'block', id: uuid() }, 'v1', { key: '', basePath }));
  });

  it('versions change with the edit time, and external sources pass through', async () => {
    assert.notEqual(imageVersion('2026-09-01T10:00:00.000Z'), imageVersion('2026-09-01T10:00:01.000Z'));
    assert.equal(imageVersion(undefined), '0');
    assert.equal(await imageSourceUrl({ kind: 'external', url: 'https://cdn.example.com/a.webp' }, { key: KEY, basePath }), 'https://cdn.example.com/a.webp');
    assert.equal(await imageSourceUrl(null, { key: KEY, basePath }), null);
  });
});

describe('serveNotionImage', () => {
  const blockId = uuid(310);
  const hostedBlock = { object: 'block', id: blockId, type: 'image', has_children: false, image: { type: 'file', file: { url: 'https://files.example/fresh.png' } } } as NotionBlock;

  it('streams a fresh copy with year-long caching and a sandbox for SVG', async () => {
    const client = mockClient({ blocks: [hostedBlock] });
    const { fetch, requests } = scriptedFetch([new Response('PNGDATA', { status: 200, headers: { 'content-type': 'image/png', 'content-length': '7' } })]);
    const path = await signImagePath({ kind: 'block', id: blockId }, 'v1', { key: KEY, basePath });
    const res = await serveNotionImage(segmentsOf(path), { client, key: KEY, fetch });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'PNGDATA');
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(requests[0]?.url, 'https://files.example/fresh.png');
    assert.deepEqual(client.calls[0]?.options, { fresh: true });
  });

  it('answers 404 to unsigned or tampered requests without calling Notion', async () => {
    const client = mockClient({ blocks: [hostedBlock] });
    const res = await serveNotionImage(['b', blockId.replace(/-/g, ''), 'v1', 'forged-signature-value'], { client, key: KEY });
    assert.equal(res.status, 404);
    assert.equal(client.calls.length, 0);
  });

  it('redirects to images that now live on an external host', async () => {
    const row = page({ Name: prop.title('Post') }, { cover: { type: 'external', external: { url: 'https://cdn.example.com/cover.webp' } } });
    const path = await signImagePath({ kind: 'cover', id: row.id }, 'v1', { key: KEY, basePath });
    const res = await serveNotionImage(segmentsOf(path), { client: mockClient({ pages: [row] }), key: KEY });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://cdn.example.com/cover.webp');
  });

  it('refuses to relay anything that is not an image, and never caches failures', async () => {
    const path = await signImagePath({ kind: 'block', id: blockId }, 'v1', { key: KEY, basePath });
    const { fetch } = scriptedFetch([new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })]);
    const res = await serveNotionImage(segmentsOf(path), { client: mockClient({ blocks: [hostedBlock] }), key: KEY, fetch });
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const failing = await serveNotionImage(segmentsOf(path), { client: mockClient({ blocks: [] }), key: KEY });
    assert.equal(failing.status, 502);
    const offline = await serveNotionImage(segmentsOf(path), {
      client: mockClient({ blocks: [hostedBlock] }),
      key: KEY,
      fetch: scriptedFetch([new TypeError('fetch failed')]).fetch,
    });
    assert.equal(offline.status, 502);
  });

  it('serves the right file of a files property', async () => {
    const row = page({
      Name: prop.title('Post'),
      Cover: prop.files(
        [
          { type: 'file', file: { url: 'https://files.example/first.png' } },
          { type: 'file', file: { url: 'https://files.example/second.png' } },
        ],
        'cov',
      ),
    });
    const { fetch, requests } = scriptedFetch([new Response('x', { status: 200, headers: { 'content-type': 'image/png' } })]);
    const path = await signImagePath({ kind: 'property', id: row.id, property: 'cov', index: 1 }, 'v1', { key: KEY, basePath });
    const res = await serveNotionImage(segmentsOf(path), { client: mockClient({ pages: [row] }), key: KEY, fetch });
    assert.equal(res.status, 200);
    assert.equal(requests[0]?.url, 'https://files.example/second.png');
  });
});
