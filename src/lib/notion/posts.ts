import type { NotionClient } from './client';
import type { BlogConfig, PublishRule } from './config';
import type { ImageSource } from './images';
import type { NotionFile, NotionPage } from './types';
import { imageVersion } from './images';
import { readCheckbox, readDate, readFiles, readList, readText } from './properties';
import { TAGS } from './tags';
import { safeSrc, slugify } from './util';

export type Post = {
  /** Notion page id. */
  id: string;
  slug: string;
  /** The Slug property exactly as typed, kept so checks can flag values that had to be cleaned up. */
  slugInput: string;
  title: string;
  excerpt: string;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  category: string;
  tags: string[];
  author: string;
  /** ISO date or date-time. */
  publishedAt: string;
  /** Where publishedAt came from: the date property, or the page's creation time as a fallback. */
  dateSource: 'property' | 'created';
  updatedAt: string;
  cover: ImageSource | null;
  coverAlt: string;
  coverIsAi: boolean;
};

/** A row that is published in Notion but cannot go on the site, with the reason. */
export type SkippedRow = { id: string; title: string; reason: string };

/** Disclosure appended to the alt text of AI-generated covers. Composed in code so the wording lives in one place. */
export const AI_IMAGE_NOTE = 'AI-generated illustration.';

export function coverAltText(post: Pick<Post, 'coverAlt' | 'coverIsAi'>): string {
  const alt = post.coverAlt.trim();
  if (!post.coverIsAi) return alt;
  return alt ? `${alt.replace(/[\s.]+$/, '')}. ${AI_IMAGE_NOTE}` : AI_IMAGE_NOTE;
}

export function publishFilter(rule: PublishRule): Record<string, unknown> {
  return rule.type === 'checkbox'
    ? { property: rule.property, checkbox: { equals: true } }
    : { property: rule.property, [rule.type]: { equals: rule.equals } };
}

function imageFrom(file: NotionFile | undefined | null, notion: ImageSource | null): ImageSource | null {
  if (file?.type === 'external') {
    const url = safeSrc(file.external.url);
    return url ? { kind: 'external', url } : null;
  }
  return file?.type === 'file' ? notion : null;
}

function coverOf(page: NotionPage, name: string): ImageSource | null {
  const version = imageVersion(page.last_edited_time);
  const property = page.properties[name];
  const [file] = readFiles(page, name);
  const fromProperty = property
    ? imageFrom(file, { kind: 'notion', ref: { kind: 'property', id: page.id, property: property.id, index: 0 }, version })
    : null;
  return fromProperty ?? imageFrom(page.cover, { kind: 'notion', ref: { kind: 'cover', id: page.id }, version });
}

export function mapPost(page: NotionPage, config: BlogConfig): Post {
  const p = config.properties;
  const slugInput = readText(page, p.slug);
  const date = readDate(page, p.date);
  return {
    id: page.id,
    slug: slugify(slugInput),
    slugInput,
    title: readText(page, p.title),
    excerpt: readText(page, p.excerpt),
    seoTitle: readText(page, p.seoTitle),
    metaDescription: readText(page, p.metaDescription),
    canonicalUrl: readText(page, p.canonicalUrl),
    category: readText(page, p.category),
    tags: readList(page, p.tags),
    author: readText(page, p.author),
    publishedAt: date || page.created_time,
    dateSource: date ? 'property' : 'created',
    updatedAt: readDate(page, p.updated) || page.last_edited_time,
    cover: coverOf(page, p.cover),
    coverAlt: readText(page, p.coverAlt),
    coverIsAi: readCheckbox(page, p.aiImage),
  };
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Every published post, newest first, plus the published rows that cannot go on the site
 * (no title, no slug, or a slug already taken by a newer post). Without a token this returns
 * nothing, so a fresh project builds before Notion is connected.
 */
export async function queryPosts(client: NotionClient, config: BlogConfig): Promise<{ posts: Post[]; skipped: SkippedRow[] }> {
  if (!client.configured) return { posts: [], skipped: [] };
  const rows = await client.queryDataSource(config.dataSource, { filter: publishFilter(config.publish) }, { tags: [TAGS.posts] });

  // Sorted here rather than by the API, so a missing date property never breaks the query.
  const mapped = rows
    .filter((row) => row.object === 'page' && !row.in_trash)
    .map((row) => mapPost(row, config))
    .sort((a, b) => time(b.publishedAt) - time(a.publishedAt) || a.id.localeCompare(b.id));

  const posts: Post[] = [];
  const skipped: SkippedRow[] = [];
  const taken = new Set<string>();
  for (const post of mapped) {
    const reason = !post.title
      ? 'it has no title'
      : !post.slug
        ? `its ${config.properties.slug} property is empty`
        : taken.has(post.slug)
          ? `the slug "${post.slug}" is already used by a newer post`
          : '';
    if (reason) {
      skipped.push({ id: post.id, title: post.title || '(untitled)', reason });
      continue;
    }
    taken.add(post.slug);
    posts.push(post);
  }
  return { posts, skipped };
}

export async function getPosts(client: NotionClient, config: BlogConfig): Promise<Post[]> {
  return (await queryPosts(client, config)).posts;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Exact match on the URL segment. */
export function findPost(posts: Post[], slug: string): Post | undefined {
  const wanted = decodeSegment(slug);
  return posts.find((post) => post.slug === wanted);
}

/**
 * The post a non-canonical segment was meant to reach ("My-Post" → "my-post"), so the route can
 * redirect permanently instead of serving the same article under two URLs.
 */
export function findPostToRedirect(posts: Post[], slug: string): Post | undefined {
  const normalized = slugify(decodeSegment(slug));
  return normalized && normalized !== decodeSegment(slug) ? posts.find((post) => post.slug === normalized) : undefined;
}
