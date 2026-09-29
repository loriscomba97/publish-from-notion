import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineBlogConfig } from '../src/lib/notion/config';
import { coverAltText, findPost, publishFilter, queryPosts } from '../src/lib/notion/posts';
import { TAGS } from '../src/lib/notion/tags';
import { mockClient, page, postRow, prop, uuid } from './helpers';

const config = defineBlogConfig({ dataSource: uuid(500), siteUrl: 'https://www.example.com', siteName: 'Example' });

describe('publishFilter', () => {
  it('filters on a checkbox by default, or on a status/select option', () => {
    assert.deepEqual(publishFilter({ type: 'checkbox', property: 'Published' }), { property: 'Published', checkbox: { equals: true } });
    assert.deepEqual(publishFilter({ type: 'status', property: 'Status', equals: 'Live' }), { property: 'Status', status: { equals: 'Live' } });
  });
});

describe('queryPosts', () => {
  it('returns nothing, without calling Notion, when no token is configured', async () => {
    const client = mockClient({ rows: [postRow({})] }, { configured: false });
    assert.deepEqual(await queryPosts(client, config), { posts: [], skipped: [] });
    assert.equal(client.calls.length, 0);
  });

  it('queries only published rows, tagged for cache purges', async () => {
    const client = mockClient({ rows: [] });
    await queryPosts(client, defineBlogConfig({ dataSource: uuid(500), publish: { type: 'status', property: 'Status', equals: 'Published' } }));
    const [call] = client.calls;
    assert.deepEqual(call?.body, { filter: { property: 'Status', status: { equals: 'Published' } } });
    assert.deepEqual(call?.options, { tags: [TAGS.posts] });
  });

  it('maps properties, cleans up slugs and falls back to page timestamps', async () => {
    const row = postRow({
      title: 'My First Post',
      slug: 'My First Post',
      date: null,
      excerpt: 'Hello.',
      category: 'Guides',
      tags: ['notion', 'nextjs'],
      author: ['Ada Lovelace'],
    });
    const { posts } = await queryPosts(mockClient({ rows: [row] }), config);
    const [post] = posts;
    assert.ok(post);
    assert.equal(post.slug, 'my-first-post');
    assert.equal(post.slugInput, 'My First Post');
    assert.equal(post.title, 'My First Post');
    assert.equal(post.excerpt, 'Hello.');
    assert.equal(post.category, 'Guides');
    assert.deepEqual(post.tags, ['notion', 'nextjs']);
    assert.equal(post.author, 'Ada Lovelace');
    assert.equal(post.publishedAt, row.created_time);
    assert.equal(post.dateSource, 'created');
    assert.equal(post.updatedAt, row.last_edited_time);
  });

  it('sorts newest first whatever order Notion returns', async () => {
    const rows = [
      postRow({ slug: 'old', date: '2025-01-10' }),
      postRow({ slug: 'new', date: '2026-09-20' }),
      postRow({ slug: 'mid', date: '2026-03-05T12:00:00.000+02:00' }),
    ];
    const { posts } = await queryPosts(mockClient({ rows }), config);
    assert.deepEqual(posts.map((p) => p.slug), ['new', 'mid', 'old']);
  });

  it('reports published rows that cannot go online instead of dropping them silently', async () => {
    const rows = [
      postRow({ title: 'Newer duplicate', slug: 'same', date: '2026-09-02' }),
      postRow({ title: 'Older duplicate', slug: 'same', date: '2026-09-01' }),
      postRow({ title: 'No slug', slug: '' }),
      postRow({ title: '', slug: 'no-title' }),
    ];
    const { posts, skipped } = await queryPosts(mockClient({ rows }), config);
    assert.deepEqual(posts.map((p) => p.title), ['Newer duplicate']);
    assert.deepEqual(
      skipped.map((s) => [s.title, s.reason]),
      [
        ['Older duplicate', 'the slug "same" is already used by a newer post'],
        ['No slug', 'its Slug property is empty'],
        ['(untitled)', 'it has no title'],
      ],
    );
  });

  it('reads custom property names', async () => {
    const custom = defineBlogConfig({ dataSource: uuid(500), properties: { title: 'Title', slug: 'URL' } });
    const row = page({ Title: prop.title('Custom'), URL: prop.text('custom-url') });
    const { posts } = await queryPosts(mockClient({ rows: [row] }), custom);
    assert.equal(posts[0]?.slug, 'custom-url');
  });
});

describe('covers', () => {
  const load = async (row: ReturnType<typeof postRow>) => (await queryPosts(mockClient({ rows: [row] }), config)).posts[0];

  it('uses an external URL as it is', async () => {
    const post = await load(postRow({ cover: prop.url('https://cdn.example.com/cover.webp') }));
    assert.deepEqual(post?.cover, { kind: 'external', url: 'https://cdn.example.com/cover.webp' });
  });

  it('turns a file uploaded to Notion into a signed proxy reference', async () => {
    const row = postRow({ cover: prop.files([{ type: 'file', file: { url: 'https://files.example/expiring' } }], 'cov%40') });
    const post = await load(row);
    assert.equal(post?.cover?.kind, 'notion');
    assert.deepEqual(post?.cover?.kind === 'notion' && post.cover.ref, { kind: 'property', id: row.id, property: 'cov%40', index: 0 });
  });

  it('falls back to the page cover', async () => {
    const row = postRow({ pageCover: { type: 'file', file: { url: 'https://files.example/expiring' } } });
    const post = await load(row);
    assert.deepEqual(post?.cover?.kind === 'notion' && post.cover.ref, { kind: 'cover', id: row.id });
  });

  it('ignores cover URLs that are not http(s)', async () => {
    const post = await load(postRow({ cover: prop.url('javascript:alert(1)') }));
    assert.equal(post?.cover, null);
  });

  it('discloses AI-generated covers in the alt text', () => {
    assert.equal(coverAltText({ coverAlt: 'A robot writing in a notebook.', coverIsAi: true }), 'A robot writing in a notebook. AI-generated illustration.');
    assert.equal(coverAltText({ coverAlt: 'A robot writing', coverIsAi: true }), 'A robot writing. AI-generated illustration.');
    assert.equal(coverAltText({ coverAlt: '', coverIsAi: true }), 'AI-generated illustration.');
    assert.equal(coverAltText({ coverAlt: 'A photo.', coverIsAi: false }), 'A photo.');
    assert.equal(coverAltText({ coverAlt: 'Mixing, at last!', coverIsAi: true }), 'Mixing, at last! AI-generated illustration.');
  });
});

describe('finding posts by URL segment', () => {
  it('matches exactly, decoding percent-encoded segments', async () => {
    const { posts } = await queryPosts(mockClient({ rows: [postRow({ slug: 'hello' }), postRow({ slug: '日本語' })] }), config);
    assert.equal(findPost(posts, 'hello')?.slug, 'hello');
    assert.equal(findPost(posts, encodeURIComponent('日本語'))?.slug, '日本語');
    assert.equal(findPost(posts, 'Hello'), undefined);
  });

});

describe('site-specific properties', () => {
  it('tries several cover properties in order, then the page cover', async () => {
    const multi = defineBlogConfig({ dataSource: uuid(500), properties: { cover: ['New cover', 'Old cover'] } });
    const onlyOld = postRow({});
    onlyOld.properties['Old cover'] = prop.files([{ type: 'external', external: { url: 'https://cdn.example.com/old.webp' } }], 'old');
    const both = postRow({ slug: 'both' });
    both.properties['New cover'] = prop.url('https://cdn.example.com/new.webp', 'new');
    both.properties['Old cover'] = prop.files([{ type: 'external', external: { url: 'https://cdn.example.com/old.webp' } }], 'old');
    const { posts } = await queryPosts(mockClient({ rows: [onlyOld, both] }), multi);
    const cover = (slug: string) => {
      const c = posts.find((p) => p.slug === slug)?.cover;
      return c?.kind === 'external' ? c.url : null;
    };
    assert.equal(cover('a-post'), 'https://cdn.example.com/old.webp');
    assert.equal(cover('both'), 'https://cdn.example.com/new.webp');
  });

  it('reads extra properties as text', async () => {
    const withExtra = defineBlogConfig({ dataSource: uuid(500), extra: { product: 'Product', missing: 'Nope' } });
    const row = postRow({});
    row.properties.Product = prop.select('Studio');
    const { posts } = await queryPosts(mockClient({ rows: [row] }), withExtra);
    assert.deepEqual(posts[0]?.extra, { product: 'Studio', missing: '' });
  });
});
