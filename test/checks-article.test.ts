import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadArticle } from '../src/lib/notion/article';
import { checkContent, formatIssues } from '../src/lib/notion/checks';
import { defineBlogConfig } from '../src/lib/notion/config';
import { verifyImagePath } from '../src/lib/notion/images';
import { queryPosts, type Post } from '../src/lib/notion/posts';
import { TAGS } from '../src/lib/notion/tags';
import { heading, mockClient, node, pageMention, para, postRow, prop, rt, uuid } from './helpers';

const config = defineBlogConfig({ dataSource: uuid(600), siteUrl: 'https://www.example.com' });
const KEY = 'test-signing-key';

async function postsFrom(rows: ReturnType<typeof postRow>[]) {
  return queryPosts(mockClient({ rows }), config);
}

describe('checkContent', () => {
  it('fails a configured build that got no posts back, but not an unconfigured one', () => {
    assert.equal(checkContent({ configured: true, posts: [], skipped: [] })[0]?.level, 'error');
    assert.deepEqual(checkContent({ configured: false, posts: [], skipped: [] }), []);
  });

  it('turns skipped rows into errors', async () => {
    const { posts, skipped } = await postsFrom([postRow({ slug: 'ok', excerpt: 'Fine.' }), postRow({ title: 'Draft', slug: '' })]);
    const issues = checkContent({ configured: true, posts, skipped });
    assert.deepEqual(issues, [{ level: 'error', post: 'Draft', message: 'Published in Notion but not on the site: its Slug property is empty.' }]);
  });

  it('warns about cleaned slugs, missing dates, long titles, descriptions and missing alt text', async () => {
    const { posts } = await postsFrom([
      postRow({
        title: 'A title that goes on and on well past what a search result can ever display in full',
        slug: 'Needs Cleanup',
        date: null,
        excerpt: 'x'.repeat(170),
        cover: prop.url('https://cdn.example.com/c.webp'),
      }),
    ]);
    const messages = checkContent({ configured: true, posts, skipped: [] }).map((i) => `${i.level}: ${i.message}`);
    assert.equal(messages.length, 5);
    assert.ok(messages.every((m) => m.startsWith('warning')));
    assert.match(messages.join('\n'), /cleaned up to "needs-cleanup"/);
    assert.match(messages.join('\n'), /creation date/);
    assert.match(messages.join('\n'), /Title is \d+ characters/);
    assert.match(messages.join('\n'), /Description is 170 characters/);
    assert.match(messages.join('\n'), /no alt text/);
  });

  it('errors on temporary Notion file links, in covers and in bodies', async () => {
    const expiring = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/def/image.png?X-Amz-Expires=3600';
    const { posts } = await postsFrom([postRow({ excerpt: 'Fine.', coverAlt: 'A cover.', cover: prop.url(expiring) })]);
    const [post] = posts as [Post];
    const issues = checkContent({
      configured: true,
      posts,
      skipped: [],
      articles: [{ post, html: `<p><a href="${expiring}">image</a></p>`, headings: [], faq: [], readingMinutes: 1, unsupported: [] }],
    });
    assert.equal(issues.filter((i) => i.level === 'error').length, 2);
  });

  it('errors on editorial placeholders left in the visible text, and warns on unsupported blocks', async () => {
    const { posts } = await postsFrom([postRow({ excerpt: 'Fine.' })]);
    const [post] = posts as [Post];
    const issues = checkContent({
      configured: true,
      posts,
      skipped: [],
      articles: [{ post, html: '<p>Numbers here [todo: check].</p>', headings: [], faq: [], readingMinutes: 1, unsupported: ['ai_block'] }],
    });
    assert.deepEqual(issues.map((i) => i.level), ['error', 'warning']);
    assert.match(formatIssues(issues), /^ERROR {4}"A post": The body still contains "\[TODO"\./);
  });
});

describe('loadArticle', () => {
  it('renders the body with signed image URLs, links between posts, a FAQ and reading time', async () => {
    const target = postRow({ title: 'Other post', slug: 'other-post', date: '2026-08-01' });
    const current = postRow({ title: 'This post', slug: 'this-post', date: '2026-09-01' });
    const image = node('image', { type: 'file', file: { url: 'https://files.example/expiring.png' }, caption: [rt('Diagram')] });
    const body = [
      para(rt('See '), pageMention('Other post', target.id), rt('.')),
      image,
      heading(1, 'FAQ'),
      para(rt('Is it fast?', { bold: true })),
      para(rt('Yes.')),
      para(rt('Is it free?', { bold: true })),
      para(rt('Yes, MIT.')),
    ];
    const client = mockClient({ rows: [current, target], trees: { [current.id]: body } });
    const { posts } = await queryPosts(client, config);
    const post = posts.find((p) => p.slug === 'this-post') as Post;

    const article = await loadArticle(client, config, post, { imageKey: KEY, posts });

    assert.match(article.html, /<a href="\/blog\/other-post">Other post<\/a>/);
    const src = article.html.match(/<img src="([^"]+)"/)?.[1] ?? '';
    assert.ok(src.startsWith('/notion-image/b/'));
    assert.ok(await verifyImagePath(src.slice('/notion-image/'.length).split('/').map(decodeURIComponent), KEY));
    assert.deepEqual(article.faq, [
      { question: 'Is it fast?', answer: 'Yes.' },
      { question: 'Is it free?', answer: 'Yes, MIT.' },
    ]);
    assert.equal(article.readingMinutes, 1);
    assert.deepEqual(
      client.calls.filter((c) => c.method === 'children').map((c) => c.options),
      [{ tags: [TAGS.page(post.id)] }],
    );
  });
});
