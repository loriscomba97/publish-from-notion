import { compactId } from './util';

/**
 * Cache tags attached to every Notion request. A webhook purges exactly what changed:
 * the post list (index, sitemap, feed, related posts) plus the one page that was edited,
 * so the other posts keep their cached bodies.
 */
export const TAGS = {
  all: 'notion',
  posts: 'notion:posts',
  page: (pageId: string) => `notion:page:${compactId(pageId)}`,
} as const;
