import { cache } from 'react';
import { blog } from '../blog.config';
import { coverAltText, createNotionClient, imageSourceUrl, loadArticle, queryPosts, TAGS, type Post } from './notion';

/**
 * The Next.js side of the kit: one Notion client wired to Next's data cache, and loaders that
 * pages, metadata, feeds and the sitemap share within a request.
 */

/** Same value as `export const revalidate` in the routes (Next needs it as a literal there). */
export const REVALIDATE_SECONDS = 3600;

/** Built-in demo content: NOTION_DEMO=1, or `next dev` before a Notion token is set. */
export const DEMO = process.env.NOTION_DEMO === '1' || (!process.env.NOTION_TOKEN && process.env.NODE_ENV === 'development');

/**
 * Whether search engines may index the site. SITE_INDEXABLE wins when set; on Vercel only
 * production is indexable; the demo never is.
 */
export const INDEXABLE = process.env.SITE_INDEXABLE
  ? process.env.SITE_INDEXABLE === 'true'
  : process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === 'production'
    : !DEMO;

const demoFetch: typeof fetch = async (input, init) => (await import('./demo/notion')).demoFetch(input, init);

export const config = DEMO ? { ...blog, dataSource: 'de000000-0000-4000-8000-000000000000' } : blog;

export const notion = createNotionClient({
  token: DEMO ? 'demo' : process.env.NOTION_TOKEN,
  fetch: DEMO ? demoFetch : undefined,
  baseUrl: process.env.NOTION_API_URL,
  // Every Notion request goes through Next's data cache with tags, so the webhook can purge
  // exactly what changed. Short-lived file URLs are never cached.
  requestInit: ({ tags, fresh }) =>
    fresh ? { cache: 'no-store' } : { cache: 'force-cache', next: { revalidate: REVALIDATE_SECONDS, tags: [TAGS.all, ...tags] } },
});

/** RSS link for every page head. Pages that set their own `alternates` must repeat it: Next does not merge them. */
export const FEED_ALTERNATE = { 'application/rss+xml': [{ url: `${config.basePath}/feed.xml`, title: `${config.siteName} RSS feed` }] };

/** Signs image URLs. Falls back to the Notion token, so it works with no extra setup. */
export const IMAGE_KEY = DEMO ? 'demo-image-key' : process.env.NOTION_IMAGE_KEY || process.env.NOTION_TOKEN || '';

/** fetch used to download files uploaded to Notion (the demo serves its own). */
export const filesFetch: typeof fetch | undefined = DEMO ? demoFetch : undefined;

export const getBlog = cache(() => queryPosts(notion, config));
export const getPosts = cache(async () => (await getBlog()).posts);
export const getArticle = cache(async (post: Post) => loadArticle(notion, config, post, { imageKey: IMAGE_KEY, posts: await getPosts() }));

export function coverUrl(post: Post): Promise<string | null> {
  return imageSourceUrl(post.cover, { key: IMAGE_KEY, basePath: config.imagePath });
}

export { coverAltText };

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

/** "September 24, 2026". Dates are formatted in UTC so a date-only value never shifts a day. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}
