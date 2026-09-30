import { cache } from 'react';
import { blog, changelog, stories } from '../blog.config';
import { DEMO_SOURCES } from './demo/sources';
import {
  coverAltText,
  createNotionClient,
  imageSourceUrl,
  loadArticle,
  loadReleaseNotes,
  queryPosts,
  queryReleases,
  TAGS,
  type ImageSource,
  type LinkTarget,
  type Post,
  type Release,
  type ReleaseNotes,
} from './notion';

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
export const INDEXABLE = !DEMO && (process.env.SITE_INDEXABLE
  ? process.env.SITE_INDEXABLE === 'true'
  : process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === 'production'
    : true);

const demoFetch: typeof fetch = async (input, init) => (await import('./demo/notion')).demoFetch(input, init);

export const config = DEMO ? { ...blog, dataSource: DEMO_SOURCES.blog } : blog;
export const storiesConfig = DEMO ? { ...stories, dataSource: DEMO_SOURCES.stories } : stories;
export const changelogConfig = DEMO ? { ...changelog, dataSource: DEMO_SOURCES.changelog } : changelog;

/**
 * The default sharing image, generated from the site name by src/app/opengraph-image.tsx. Pages
 * without a cover of their own share it.
 */
export const SHARE_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: config.siteName };

/** Customer stories and the changelog are optional: each is on once its database is set. */
export const STORIES_ON = Boolean(storiesConfig.dataSource);
export const CHANGELOG_ON = Boolean(changelogConfig.dataSource);

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

/** The changelog page also offers its own feed of releases. */
export const CHANGELOG_FEED_ALTERNATE = {
  'application/rss+xml': [
    { url: `${changelogConfig.basePath}/feed.xml`, title: `${changelogConfig.label} | ${config.siteName}` },
    ...FEED_ALTERNATE['application/rss+xml'],
  ],
};

/** Signs image URLs. Falls back to the Notion token, so it works with no extra setup. */
export const IMAGE_KEY = DEMO ? 'demo-image-key' : process.env.NOTION_IMAGE_KEY || process.env.NOTION_TOKEN || '';

/** fetch used to download files uploaded to Notion (the demo serves its own). */
export const filesFetch: typeof fetch | undefined = DEMO ? demoFetch : undefined;

export const getBlog = cache(() => queryPosts(notion, config));
export const getPosts = cache(async () => (await getBlog()).posts);

export const getStoriesList = cache(() => (STORIES_ON ? queryPosts(notion, storiesConfig) : Promise.resolve({ posts: [] as Post[], skipped: [] })));
export const getStories = cache(async () => (await getStoriesList()).posts);

export const getChangelog = cache(() => (CHANGELOG_ON ? queryReleases(notion, changelogConfig) : Promise.resolve({ releases: [] as Release[], skipped: [] })));
export const getReleases = cache(async () => (await getChangelog()).releases);

/** Every post and story, so a link from one collection to another becomes a link on the site. */
export const getLinkTargets = cache(async (): Promise<LinkTarget[]> => [
  ...(await getPosts()).map((post) => ({ id: post.id, href: `${config.basePath}/${post.slug}`, title: post.title })),
  ...(await getStories()).map((story) => ({ id: story.id, href: `${storiesConfig.basePath}/${story.slug}`, title: story.title })),
]);

export const getArticle = cache(async (post: Post) =>
  loadArticle(notion, config, post, { imageKey: IMAGE_KEY, posts: await getPosts(), links: await getLinkTargets() }),
);

export const getStoryArticle = cache(async (story: Post) =>
  loadArticle(notion, storiesConfig, story, { imageKey: IMAGE_KEY, posts: await getStories(), links: await getLinkTargets() }),
);

/**
 * Every release with its rendered page content (null when the page is empty or bodies are off).
 * Rendered in order so heading ids stay unique across the one changelog page.
 */
export const getReleaseEntries = cache(async (): Promise<Array<{ release: Release; notes: ReleaseNotes | null }>> => {
  const releases = await getReleases();
  if (!changelogConfig.body) return releases.map((release) => ({ release, notes: null }));
  const targets = new Map((await getLinkTargets()).map((link) => [link.id.replace(/-/g, ''), link]));
  const used = releases.map((release) => release.anchor);
  const entries: Array<{ release: Release; notes: ReleaseNotes | null }> = [];
  for (const release of releases) {
    const notes = await loadReleaseNotes(notion, changelogConfig, release, {
      imageKey: IMAGE_KEY,
      usedIds: used,
      resolvePage: (pageId) => {
        const target = targets.get(pageId.replace(/-/g, ''));
        return target ? { href: target.href, title: target.title } : null;
      },
    });
    used.push(...notes.headingIds);
    entries.push({ release, notes: notes.html.trim() ? notes : null });
  }
  return entries;
});

export function imageUrl(source: ImageSource | null | undefined): Promise<string | null> {
  return imageSourceUrl(source ?? null, { key: IMAGE_KEY, basePath: config.imagePath });
}

export function coverUrl(post: Post): Promise<string | null> {
  return imageUrl(post.cover);
}

export { coverAltText };

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

/** "September 24, 2026". Dates are formatted in UTC so a date-only value never shifts a day. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}
