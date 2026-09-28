import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, createNotionClient, NOTION_API_VERSION, NotionApiError } from '../src/lib/notion/client';
import { json, scriptedFetch, uuid } from './helpers';

const TOKEN = 'test-token-not-a-real-secret';
const noSleep = async () => {};
const list = (results: unknown[], next: string | null = null) => ({ object: 'list', results, has_more: next !== null, next_cursor: next });

describe('createNotionClient', () => {
  it('reports whether it is configured and refuses calls without a token', async () => {
    const client = createNotionClient({ token: undefined });
    assert.equal(client.configured, false);
    await assert.rejects(client.retrievePage(uuid()), (e: NotionApiError) => e.code === 'not_configured');
  });

  it('sends auth, API version and JSON headers, and merges extra fetch options', async () => {
    const { fetch, requests } = scriptedFetch([json(200, list([]))]);
    const seen: unknown[] = [];
    const client = createNotionClient({
      token: TOKEN,
      fetch,
      requestInit: (request) => {
        seen.push(request);
        return { next: { tags: request.tags } } as RequestInit;
      },
    });
    const id = uuid();
    await client.queryDataSource(id, { filter: { property: 'Published', checkbox: { equals: true } } }, { tags: ['notion:posts'] });

    const [request] = requests;
    assert.ok(request);
    assert.equal(request.url, `https://api.notion.com/v1/data_sources/${id}/query`);
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
    assert.equal(headers.get('notion-version'), NOTION_API_VERSION);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.deepEqual((request.init as { next?: unknown }).next, { tags: ['notion:posts'] });
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      filter: { property: 'Published', checkbox: { equals: true } },
      page_size: 100,
    });
    assert.deepEqual(seen, [{ method: 'POST', path: `/data_sources/${id}/query`, tags: ['notion:posts'], fresh: false }]);
  });

  it('follows pagination cursors', async () => {
    const { fetch, requests } = scriptedFetch([json(200, list([{ object: 'block', id: 'a' }], 'cursor-2')), json(200, list([{ object: 'block', id: 'b' }]))]);
    const client = createNotionClient({ token: TOKEN, fetch });
    const blocks = await client.listBlockChildren(uuid());
    assert.deepEqual(blocks.map((b) => b.id), ['a', 'b']);
    assert.match(requests[1]?.url ?? '', /start_cursor=cursor-2/);
  });

  it('waits for Retry-After on 429, then succeeds', async () => {
    const waits: number[] = [];
    const { fetch } = scriptedFetch([json(429, { code: 'rate_limited' }, { 'retry-after': '2' }), json(200, { object: 'page', id: 'p' })]);
    const client = createNotionClient({ token: TOKEN, fetch, log: () => {}, sleep: async (ms) => void waits.push(ms) });
    const result = await client.retrievePage(uuid());
    assert.equal(result.id, 'p');
    assert.deepEqual(waits, [2000]);
  });

  it('retries server and network errors, then gives up with a typed error', async () => {
    const { fetch, requests } = scriptedFetch([
      new TypeError('socket hang up'),
      json(503, { code: 'service_unavailable', message: 'Try again' }),
      json(503, { code: 'service_unavailable', message: 'Try again' }),
    ]);
    const client = createNotionClient({ token: TOKEN, fetch, maxRetries: 2, log: () => {}, sleep: noSleep });
    await assert.rejects(client.retrieveBlock(uuid()), (e: NotionApiError) => e.status === 503 && e.code === 'service_unavailable');
    assert.equal(requests.length, 3);
  });

  it('does not retry client errors and passes Notion’s message on', async () => {
    const { fetch, requests } = scriptedFetch([json(400, { code: 'validation_error', message: 'Could not find property with name or id: Published' })]);
    const client = createNotionClient({ token: TOKEN, fetch, sleep: noSleep });
    await assert.rejects(client.retrievePage(uuid()), /Could not find property with name or id: Published/);
    assert.equal(requests.length, 1);
  });

  it('explains how to fix a 404: share the database with the integration', async () => {
    const { fetch } = scriptedFetch([json(404, { code: 'object_not_found', message: 'Could not find page' })]);
    const client = createNotionClient({ token: TOKEN, fetch });
    await assert.rejects(client.retrievePage(uuid()), /Connections/);
  });

  it('resolves a database id to its data source once, then queries the data source directly', async () => {
    const databaseId = uuid();
    const dataSourceId = uuid();
    const { fetch, requests } = scriptedFetch([
      json(404, { code: 'object_not_found', message: 'Could not find data source' }),
      json(200, { object: 'database', id: databaseId, data_sources: [{ id: dataSourceId, name: 'Posts' }] }),
      json(200, list([{ object: 'page', id: 'row-1' }])),
      json(200, list([{ object: 'page', id: 'row-2' }])),
    ]);
    const client = createNotionClient({ token: TOKEN, fetch });
    const first = await client.queryDataSource(`https://www.notion.so/acme/Blog-${databaseId.replace(/-/g, '')}?v=123`);
    const second = await client.queryDataSource(databaseId);
    assert.deepEqual([first[0]?.id, second[0]?.id], ['row-1', 'row-2']);
    assert.deepEqual(
      requests.map((r) => r.url.replace('https://api.notion.com/v1', '')),
      [`/data_sources/${databaseId}/query`, `/databases/${databaseId}`, `/data_sources/${dataSourceId}/query`, `/data_sources/${dataSourceId}/query`],
    );
  });

  it('rejects input that is not a Notion id', async () => {
    const client = createNotionClient({ token: TOKEN, fetch: scriptedFetch([]).fetch });
    await assert.rejects(client.queryDataSource('my blog'), (e: NotionApiError) => e.code === 'invalid_id');
  });
});

describe('createLimiter', () => {
  it('never runs more tasks at once than allowed', async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 12 }, task));
    assert.equal(peak, 3);
  });
});
