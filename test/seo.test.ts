import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineBlogConfig } from '../src/lib/notion/config';
import { rssFeed } from '../src/lib/notion/feed';
import { llmsTxt } from '../src/lib/notion/llms';
import type { Post } from '../src/lib/notion/posts';
import { blogJsonLd, postJsonLd, postMetadata, postUrl, serializeJsonLd } from '../src/lib/notion/seo';

const config = defineBlogConfig({ siteUrl: 'https://www.example.com/', siteName: 'Example', basePath: 'blog/' });

const post: Post = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'hello-world',
  slugInput: 'hello-world',
  title: 'Hello & <world>',
  excerpt: 'The first post.',
  seoTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  category: 'News',
  tags: ['notion', 'nextjs'],
  author: 'Ada Lovelace',
  publishedAt: '2026-09-01',
  dateSource: 'property',
  updatedAt: '2026-09-02T08:00:00.000Z',
  cover: null,
  coverAlt: '',
  coverIsAi: false,
};

describe('config paths', () => {
  it('normalizes the site URL and base path', () => {
    assert.equal(config.siteUrl, 'https://www.example.com');
    assert.equal(config.basePath, '/blog');
  });
});

describe('postMetadata', () => {
  it('falls back from SEO fields to the title and excerpt, with absolute URLs', () => {
    const meta = postMetadata(config, post, { imageUrl: '/notion-image/c/x/v/s', imageAlt: 'Cover' });
    assert.equal(meta.title, 'Hello & <world>');
    assert.equal(meta.description, 'The first post.');
    assert.equal(meta.canonical, 'https://www.example.com/blog/hello-world');
    assert.deepEqual(meta.openGraph.images, [{ url: 'https://www.example.com/notion-image/c/x/v/s', alt: 'Cover' }]);
    assert.equal(meta.twitter.card, 'summary_large_image');
  });

  it('prefers the SEO overrides and a canonical URL set in Notion', () => {
    const meta = postMetadata(config, { ...post, seoTitle: 'SEO title', metaDescription: 'SEO description', canonicalUrl: 'https://medium.example/p/1' });
    assert.equal(meta.title, 'SEO title');
    assert.equal(meta.description, 'SEO description');
    assert.equal(meta.canonical, 'https://medium.example/p/1');
    assert.equal(meta.twitter.card, 'summary');
  });

  it('builds post URLs from the base path', () => {
    assert.equal(postUrl(config, post), 'https://www.example.com/blog/hello-world');
  });
});

describe('JSON-LD', () => {
  it('links BlogPosting, WebPage, breadcrumbs, site and publisher in one graph', () => {
    const data = postJsonLd(config, post, { authorUrl: 'https://www.example.com/team/ada', publisher: { name: 'Example Inc.', url: 'https://www.example.com', logo: '/logo.png' } });
    const graph = data['@graph'] as Array<Record<string, unknown>>;
    assert.deepEqual(graph.map((n) => n['@type']), ['BlogPosting', 'WebPage', 'BreadcrumbList', 'WebSite', 'Organization']);
    const article = graph[0] ?? {};
    assert.equal(article['@id'], 'https://www.example.com/blog/hello-world#article');
    assert.deepEqual(article.author, { '@type': 'Person', name: 'Ada Lovelace', url: 'https://www.example.com/team/ada' });
    assert.deepEqual(article.publisher, { '@id': 'https://www.example.com/#publisher' });
    assert.equal(graph[4]?.logo, 'https://www.example.com/logo.png');
  });

  it('adds FAQPage only for a real FAQ with at least two pairs', () => {
    const one = postJsonLd(config, post, { faq: [{ question: 'Q?', answer: 'A.' }] })['@graph'] as unknown[];
    const two = postJsonLd(config, post, { faq: [{ question: 'Q1?', answer: 'A1.' }, { question: 'Q2?', answer: 'A2.' }] })['@graph'] as Array<Record<string, unknown>>;
    assert.equal(one.length, 5);
    assert.equal(two.at(-1)?.['@type'], 'FAQPage');
  });

  it('describes the blog index', () => {
    const data = blogJsonLd(config, [post]);
    assert.equal(data['@type'], 'Blog');
    assert.equal((data.blogPost as Array<Record<string, unknown>>)[0]?.url, 'https://www.example.com/blog/hello-world');
  });

  it('serializes safely for an inline script tag', () => {
    const out = serializeJsonLd({ headline: '</script><script>alert(1)</script>' });
    assert.ok(!out.includes('</script>'));
    assert.deepEqual(JSON.parse(out), { headline: '</script><script>alert(1)</script>' });
  });
});

describe('rssFeed', () => {
  it('escapes XML and uses RFC 822 dates', () => {
    const feed = rssFeed(config, [post]);
    assert.match(feed, /<title>Hello &amp; &lt;world&gt;<\/title>/);
    assert.match(feed, /<pubDate>Tue, 01 Sep 2026 00:00:00 GMT<\/pubDate>/);
    assert.match(feed, /<atom:link href="https:\/\/www\.example\.com\/blog\/feed\.xml" rel="self"/);
    assert.match(feed, /<dc:creator>Ada Lovelace<\/dc:creator>/);
    assert.ok(feed.endsWith('</rss>\n'));
  });

  it('limits the number of items', () => {
    const feed = rssFeed(config, [post, { ...post, slug: 'two' }, { ...post, slug: 'three' }], { limit: 2 });
    assert.equal(feed.match(/<item>/g)?.length, 2);
  });
});

describe('llmsTxt', () => {
  it('lists the posts under a Blog section, after any extra sections', () => {
    const out = llmsTxt(config, [{ ...post, title: 'Hello [draft]' }], {
      summary: 'Notes about   publishing.',
      sections: [{ title: 'Docs', links: [{ title: 'Setup', url: 'https://www.example.com/docs' }] }],
    });
    assert.equal(
      out,
      [
        '# Example',
        '',
        '> Notes about publishing.',
        '',
        '## Docs',
        '',
        '- [Setup](https://www.example.com/docs)',
        '',
        '## Blog',
        '',
        '- [Hello draft](https://www.example.com/blog/hello-world): The first post.',
        '',
      ].join('\n'),
    );
  });
});
