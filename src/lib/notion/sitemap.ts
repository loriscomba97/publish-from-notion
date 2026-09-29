import type { BlogConfig } from './config';
import type { Post } from './posts';
import { absoluteUrl, postPath } from './seo';

/**
 * XML sitemap, served from an ordinary route handler (app/sitemap.xml/route.ts) rather than
 * Next's sitemap.ts convention: on Vercel the convention was not purged by revalidateTag in our
 * tests, so an unpublished post stayed listed until the hourly refresh. A route handler is purged
 * like every other page.
 */

export type SitemapEntry = { url: string; lastModified?: string };

/** Home, blog index and every post whose canonical URL is on this site. */
export function sitemapEntries(config: BlogConfig, posts: Post[]): SitemapEntry[] {
  const own = posts.filter((post) => !post.canonicalUrl || post.canonicalUrl === absoluteUrl(config, postPath(config, post)));
  return [
    { url: absoluteUrl(config, '/') },
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
