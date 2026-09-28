import type { BlogConfig } from './config';
import type { Post } from './posts';
import { absoluteUrl, postPath } from './seo';

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const rfc822 = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
};

/** RSS 2.0 feed of the latest posts. Serve it with `Content-Type: application/rss+xml; charset=utf-8`. */
export function rssFeed(
  config: BlogConfig,
  posts: Post[],
  options: { title?: string; description?: string; feedPath?: string; limit?: number } = {},
): string {
  const feedUrl = absoluteUrl(config, options.feedPath ?? `${config.basePath}/feed.xml`);
  const items = posts.slice(0, options.limit ?? 50).map((post) => {
    const url = absoluteUrl(config, postPath(config, post));
    const date = rfc822(post.publishedAt);
    return [
      '    <item>',
      `      <title>${xml(post.title)}</title>`,
      `      <link>${xml(url)}</link>`,
      `      <guid isPermaLink="true">${xml(url)}</guid>`,
      date ? `      <pubDate>${date}</pubDate>` : '',
      post.excerpt ? `      <description>${xml(post.excerpt)}</description>` : '',
      post.author ? `      <dc:creator>${xml(post.author)}</dc:creator>` : '',
      post.category ? `      <category>${xml(post.category)}</category>` : '',
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n');
  });
  const newest = posts[0] ? rfc822(posts[0].updatedAt || posts[0].publishedAt) : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${xml(options.title ?? config.siteName)}</title>`,
    `    <link>${xml(absoluteUrl(config, config.basePath))}</link>`,
    `    <description>${xml(options.description ?? `Latest posts from ${config.siteName}`)}</description>`,
    `    <atom:link href="${xml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    newest ? `    <lastBuildDate>${newest}</lastBuildDate>` : '',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line, i, all) => line !== '' || i === all.length - 1)
    .join('\n');
}
