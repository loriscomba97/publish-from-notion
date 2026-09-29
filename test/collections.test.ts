import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadArticle } from '../src/lib/notion/article';
import { defineBlogConfig } from '../src/lib/notion/config';
import { llmsTxt } from '../src/lib/notion/llms';
import { queryPosts } from '../src/lib/notion/posts';
import { blogJsonLd, postJsonLd } from '../src/lib/notion/seo';
import { sitemapEntries } from '../src/lib/notion/sitemap';
import { mockClient, pageMention, para, postRow, prop, rt, uuid } from './helpers';

// A second collection on the same site: customer stories, with a featured flag and an avatar.
const stories = defineBlogConfig({
  dataSource: uuid(700),
  siteUrl: 'https://www.example.com',
  siteName: 'Example',
  basePath: '/customers',
  label: 'Customer stories',
  articleType: 'Article',
  properties: { featured: 'Featured' },
  extra: { customer: 'Customer', quote: 'Pull quote' },
  images: { avatar: ['Avatar', 'Photo'] },
});

function storyRow(fields: { id?: string; title: string; slug: string; date: string; featured?: boolean; avatar?: ReturnType<typeof prop.files> }) {
  const row = postRow({ id: fields.id, title: fields.title, slug: fields.slug, date: fields.date });
  row.properties.Featured = prop.checkbox(fields.featured ?? false, 'fea');
  row.properties.Customer = prop.text('Ada, Northwind', 'cus');
  row.properties['Pull quote'] = prop.text('It just works.', 'quo');
  if (fields.avatar) row.properties.Photo = fields.avatar;
  return row;
}

describe('collections', () => {
  it('lists featured entries first when the config names a featured property, and only then', async () => {
    const rows = [
      storyRow({ title: 'Newest', slug: 'newest', date: '2026-09-20' }),
      storyRow({ title: 'Featured old', slug: 'featured-old', date: '2026-01-01', featured: true }),
      storyRow({ title: 'Middle', slug: 'middle', date: '2026-05-01' }),
    ];
    const { posts } = await queryPosts(mockClient({ rows }), stories);
    assert.deepEqual(posts.map((p) => p.slug), ['featured-old', 'newest', 'middle']);
    assert.equal(posts[0]?.featured, true);

    const blog = defineBlogConfig({ dataSource: uuid(701) });
    const { posts: plain } = await queryPosts(mockClient({ rows }), blog);
    assert.deepEqual(plain.map((p) => p.slug), ['newest', 'middle', 'featured-old']);
    assert.ok(plain.every((p) => p.featured === false));
  });

  it('reads extra text and image properties, trying image names in order, with no page-cover fallback', async () => {
    const withPhoto = storyRow({
      id: uuid(710),
      title: 'Photo',
      slug: 'photo',
      date: '2026-09-01',
      avatar: prop.files([{ type: 'external', name: 'p.jpg', external: { url: 'https://cdn.example.com/ada.jpg' } }], 'pho'),
    });
    const uploaded = storyRow({
      id: uuid(711),
      title: 'Uploaded',
      slug: 'uploaded',
      date: '2026-08-01',
      avatar: prop.files([{ type: 'file', name: 'u.png', file: { url: 'https://files.example/u.png', expiry_time: '2026-09-01T11:00:00.000Z' } }], 'pho'),
    });
    const none = storyRow({ id: uuid(712), title: 'None', slug: 'none', date: '2026-07-01' });
    none.cover = { type: 'external', external: { url: 'https://cdn.example.com/cover.jpg' } };
    const { posts } = await queryPosts(mockClient({ rows: [withPhoto, uploaded, none] }), stories);
    assert.deepEqual(posts[0]?.extra, { customer: 'Ada, Northwind', quote: 'It just works.' });
    assert.deepEqual(posts[0]?.images.avatar, { kind: 'external', url: 'https://cdn.example.com/ada.jpg' });
    assert.equal(posts[1]?.images.avatar?.kind, 'notion');
    assert.deepEqual(posts[1]?.images.avatar?.kind === 'notion' && posts[1].images.avatar.ref, { kind: 'property', id: uuid(711), property: 'pho', index: 0 });
    assert.equal(posts[2]?.images.avatar, null);
  });

  it('marks entries up as the configured article type, with the collection in the breadcrumb', async () => {
    const { posts } = await queryPosts(mockClient({ rows: [storyRow({ title: 'Case study', slug: 'case-study', date: '2026-09-01' })] }), stories);
    const graph = postJsonLd(stories, posts[0]!)['@graph'] as Array<Record<string, unknown>>;
    assert.equal(graph[0]?.['@type'], 'Article');
    const crumbs = (graph[2]?.itemListElement as Array<Record<string, unknown>>).map((i) => i.name);
    assert.deepEqual(crumbs, ['Home', 'Customer stories', 'Case study']);
    const index = blogJsonLd(stories, posts, { description: 'Stories.' });
    assert.equal(index['@type'], 'CollectionPage');
    assert.equal((index.hasPart as Array<Record<string, unknown>>)[0]?.['@type'], 'Article');

    const blog = defineBlogConfig({ siteUrl: 'https://www.example.com', siteName: 'Example' });
    assert.equal(blogJsonLd(blog, posts)['@type'], 'Blog');
    assert.equal((postJsonLd(blog, posts[0]!)['@graph'] as Array<Record<string, unknown>>)[0]?.['@type'], 'BlogPosting');
  });

  it('titles the llms.txt section with the collection label and can leave the home page out of a second sitemap', async () => {
    const { posts } = await queryPosts(mockClient({ rows: [storyRow({ title: 'Case study', slug: 'case-study', date: '2026-09-01' })] }), stories);
    assert.match(llmsTxt(stories, posts), /## Customer stories\n\n- \[Case study\]\(https:\/\/www\.example\.com\/customers\/case-study\)/);
    assert.deepEqual(sitemapEntries(stories, posts, { home: false }).map((e) => e.url), [
      'https://www.example.com/customers',
      'https://www.example.com/customers/case-study',
    ]);
    assert.equal(sitemapEntries(stories, posts)[0]?.url, 'https://www.example.com/');
  });

  it('resolves links to pages of other collections, and still drops unknown workspace pages', async () => {
    const story = postRow({ id: uuid(720), title: 'Story', slug: 'story' });
    const blogPost = uuid(721);
    const client = mockClient({ trees: { [uuid(720)]: [para(pageMention('the launch post', blogPost), rt(' and '), pageMention('a private page', uuid(722)))] } });
    const { posts } = await queryPosts(mockClient({ rows: [story] }), stories);
    const article = await loadArticle(client, stories, posts[0]!, {
      imageKey: 'k'.repeat(32),
      posts,
      links: [{ id: blogPost, href: '/blog/launch', title: 'Launch' }],
    });
    assert.match(article.html, /<a href="\/blog\/launch">the launch post<\/a>/);
    assert.ok(!article.html.includes(uuid(722).replace(/-/g, '')));
  });
});
