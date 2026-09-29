import type { BlogConfig } from './config';
import type { Post } from './posts';
import { absoluteUrl, postPath } from './seo';

/**
 * XML sitemap, for a route handler at app/sitemap.xml/route.ts that renders on every request
 * (`revalidate = 0`) while its data stays in the tagged cache. On Vercel, a cached /sitemap.xml
 * was not reached by webhook purges, neither through Next's sitemap.ts convention nor as a cached
 * route handler, so an unpublished post stayed listed until the hourly refresh.
 */

export type SitemapEntry = { url: string; lastModified?: string };

/**
 * Home, the collection index and every post whose canonical URL is on this site. For a second
 * collection on the same site, pass `{ home: false }` so the home page is listed once.
 */
export function sitemapEntries(config: BlogConfig, posts: Post[], options: { home?: boolean } = {}): SitemapEntry[] {
  const own = posts.filter((post) => !post.canonicalUrl || post.canonicalUrl === absoluteUrl(config, postPath(config, post)));
  return [
    ...(options.home === false ? [] : [{ url: absoluteUrl(config, '/') }]),
    { url: absoluteUrl(config, config.basePath), lastModified: posts[0]?.updatedAt },
    ...own.map((post) => ({ url: absoluteUrl(config, postPath(config, post)), lastModified: post.updatedAt })),
  ];
}

const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function isoDate(value: string | undefined): string {
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Serve with `Content-Type: application/xml; charset=utf-8`. */
export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const lastmod = isoDate(entry.lastModified);
    return `  <url><loc>${xml(entry.url)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}
