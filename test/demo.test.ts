import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { demoFetch } from '../src/lib/demo/notion';
import { DEMO_SOURCES } from '../src/lib/demo/sources';
import { uuid } from './helpers';

describe('demo workspace', () => {
  it('answers each data source with its own rows only, so every collection has its own content', async () => {
    const query = async (source: string) => {
      const res = await demoFetch(`https://api.notion.com/v1/data_sources/${source}/query`, {
        method: 'POST',
        body: JSON.stringify({ filter: { property: 'Published', checkbox: { equals: true } } }),
      });
      const body = (await res.json()) as { results: Array<{ properties: Record<string, { title?: Array<{ plain_text: string }> }> }> };
      return body.results.map((page) => page.properties.Name?.title?.map((t) => t.plain_text).join('') ?? '');
    };
    const [posts, stories, releases, unknown] = await Promise.all([
      query(DEMO_SOURCES.blog),
      query(DEMO_SOURCES.stories),
      query(DEMO_SOURCES.changelog),
      query(uuid(799)),
    ]);
    assert.equal(posts.length, 4);
    assert.deepEqual(stories.sort(), ['A design studio publishes its case studies from Notion', 'A newsletter keeps its archive on its own domain']);
    assert.deepEqual(releases.sort(), ['Changelog and customer stories', 'First public release']);
    assert.deepEqual(unknown, []);
  });
});
