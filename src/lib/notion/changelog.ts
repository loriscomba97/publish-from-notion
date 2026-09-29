import type { NotionClient } from './client';
import type { ChangelogConfig } from './config';
import type { LlmsSection } from './llms';
import type { SkippedRow } from './posts';
import type { PageLink } from './render';
import type { SitemapEntry } from './sitemap';
import type { NotionFile, NotionPage } from './types';
import { fetchBlockTree, walkBlocks } from './blocks';
import { imageVersion, signImagePath } from './images';
import { publishFilter } from './posts';
import { readDate, readText } from './properties';
import { renderBlocks } from './render';
import { absoluteUrl } from './seo';
import { TAGS } from './tags';
import { compactId, slugify } from './util';

/**
 * A changelog kept in a Notion database: one row per release, published with the same checkbox
 * as a post. Short notes go in list properties (one change per line: New, Improved, Fixed);
 * longer notes, screenshots and code go in the page itself. The whole changelog is one page,
 * each release with its own anchor, plus an RSS feed of releases.
 */

export type ReleaseSection = { label: string; items: string[] };

export type Release = {
  /** Notion page id. */
  id: string;
  title: string;
  version: string;
  /** ISO date or date-time. */
  date: string;
  /** Where the date came from: the date property, or the page's creation time as a fallback. */
  dateSource: 'property' | 'created';
  updatedAt: string;
  product: string;
  summary: string;
  /** Fragment id on the changelog page, unique: from the version when set, else the title. */
  anchor: string;
  /** The configured sections that have at least one item, in the configured order. */
  sections: ReleaseSection[];
};

export type ReleaseNotes = {
  html: string;
  /** Visible text, for search snippets and the content check. */
  text: string;
  /** Heading ids used by these notes; pass them on so the next release's headings stay unique. */
  headingIds: string[];
  /** Block types the renderer does not support; the content check reports them. */
  unsupported: string[];
};

/** Ids that belong to the page layout, never used as anchors. */
const LAYOUT_IDS = ['main', 'content', 'top', 'header', 'footer', 'nav'];

/** One change per line. List markers typed in Notion ("- ", "* ", "• ", "1. ") are dropped. */
export function splitItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

/** "2.3.0: Faster exports", or whichever of the two the release has. */
export function releaseName(release: Pick<Release, 'version' | 'title'>): string {
  if (release.version && release.title) return `${release.version}: ${release.title}`;
  return release.title || release.version;
}

export function mapRelease(page: NotionPage, config: ChangelogConfig): Omit<Release, 'anchor'> {
  const p = config.properties;
  const date = readDate(page, p.date);
  return {
    id: page.id,
    title: readText(page, p.title),
    version: readText(page, p.version),
    date: date || page.created_time,
    dateSource: date ? 'property' : 'created',
    updatedAt: page.last_edited_time,
    product: readText(page, p.product),
    summary: readText(page, p.summary),
    sections: config.sections
      .map((section) => ({ label: section.label, items: splitItems(readText(page, section.property)) }))
      .filter((section) => section.items.length > 0),
  };
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Every published release, newest first, plus the published rows that cannot go on the site (no
 * name and no version, or, with page bodies off, no notes at all). Without a token or a data
 * source this returns nothing, so the changelog stays optional.
 */
export async function queryReleases(client: NotionClient, config: ChangelogConfig): Promise<{ releases: Release[]; skipped: SkippedRow[] }> {
  if (!client.configured || !config.dataSource) return { releases: [], skipped: [] };
  const rows = await client.queryDataSource(config.dataSource, { filter: publishFilter(config.publish) }, { tags: [TAGS.posts] });
  const mapped = rows
    .filter((row) => row.object === 'page' && !row.in_trash)
    .map((row) => ({ row, release: mapRelease(row, config) }))
    .sort(
      (a, b) =>
        time(b.release.date) - time(a.release.date) ||
        time(b.row.created_time) - time(a.row.created_time) ||
        a.release.id.localeCompare(b.release.id),
    );

  const releases: Release[] = [];
  const skipped: SkippedRow[] = [];
  const used = new Set(LAYOUT_IDS);
  for (const { release } of mapped) {
    const name = releaseName(release);
    if (!name) {
      skipped.push({ id: release.id, title: '(untitled)', reason: `it has neither a ${config.properties.title} nor a ${config.properties.version}` });
      continue;
    }
    if (!config.body && release.sections.length === 0 && !release.summary) {
      skipped.push({ id: release.id, title: name, reason: 'it has no notes: fill a section property, or turn page bodies on' });
      continue;
    }
    const base = slugify(release.version ? `v${release.version}` : release.title, 'release');
    let anchor = base;
    for (let n = 2; used.has(anchor); n++) anchor = `${base}-${n}`;
    used.add(anchor);
    releases.push({ ...release, anchor });
  }
  return { releases, skipped };
}

/** Path of a release on the site: the changelog page and the release's anchor. */
export function releasePath(config: ChangelogConfig, release: Pick<Release, 'anchor'>): string {
  return `${config.basePath}#${release.anchor}`;
}

export function releaseUrl(config: ChangelogConfig, release: Pick<Release, 'anchor'>): string {
  return absoluteUrl(config, releasePath(config, release));
}

/**
 * Renders a release's page content. Several releases share one page, so pass the ids already in
 * use (the anchors, and the heading ids of the notes rendered before) to keep every id unique.
 */
export async function loadReleaseNotes(
  client: NotionClient,
  config: ChangelogConfig,
  release: Release,
  options: { imageKey: string; usedIds?: string[]; headingOffset?: number; resolvePage?: (pageId: string) => PageLink | null },
): Promise<ReleaseNotes> {
  const tree = await fetchBlockTree(client, release.id, { tags: [TAGS.page(release.id)] });
  const imageUrls = new Map<string, string>();
  for (const { block } of walkBlocks(tree)) {
    if (block.type !== 'image' || (block.image as NotionFile).type !== 'file') continue;
    const version = imageVersion(block.last_edited_time ?? release.updatedAt);
    imageUrls.set(compactId(block.id), await signImagePath({ kind: 'block', id: block.id }, version, { key: options.imageKey, basePath: config.imagePath }));
  }
  const rendered = renderBlocks(tree, {
    imageUrls,
    headingOffset: options.headingOffset ?? 2,
    reservedIds: [...LAYOUT_IDS, ...(options.usedIds ?? [])],
    resolvePage: options.resolvePage,
  });
  return { html: rendered.html, text: rendered.text, headingIds: rendered.headings.map((h) => h.id), unsupported: rendered.unsupported };
}

/** Plain-text digest of a release, for the feed and llms.txt: its summary, else its sections. */
export function releaseDigest(release: Pick<Release, 'summary' | 'sections'>): string {
  if (release.summary) return release.summary;
  return release.sections.map((section) => `${section.label}: ${section.items.join('; ')}.`).join(' ');
}

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const rfc822 = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString();
};

/** RSS 2.0 feed of releases. Serve it with `Content-Type: application/rss+xml; charset=utf-8`. */
export function changelogFeed(
  config: ChangelogConfig,
  releases: Release[],
  options: { title?: string; description?: string; feedPath?: string; limit?: number } = {},
): string {
  const feedUrl = absoluteUrl(config, options.feedPath ?? `${config.basePath}/feed.xml`);
  const items = releases.slice(0, options.limit ?? 50).map((release) => {
    const url = releaseUrl(config, release);
    const date = rfc822(release.date);
    const digest = releaseDigest(release);
    return [
      '    <item>',
      `      <title>${xml(releaseName(release))}</title>`,
      `      <link>${xml(url)}</link>`,
      `      <guid isPermaLink="true">${xml(url)}</guid>`,
      date ? `      <pubDate>${date}</pubDate>` : '',
      digest ? `      <description>${xml(digest)}</description>` : '',
      release.product ? `      <category>${xml(release.product)}</category>` : '',
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n');
  });
  const newest = releases[0] ? rfc822(releases[0].updatedAt || releases[0].date) : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xml(options.title ?? `${config.label} | ${config.siteName}`)}</title>`,
    `    <link>${xml(absoluteUrl(config, config.basePath))}</link>`,
    `    <description>${xml(options.description ?? `Releases of ${config.siteName}`)}</description>`,
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

/** The changelog page for the sitemap, dated by its newest release. */
export function changelogSitemapEntry(config: ChangelogConfig, releases: Release[]): SitemapEntry {
  return { url: absoluteUrl(config, config.basePath), lastModified: releases[0]?.updatedAt || releases[0]?.date };
}

/** A section for llms.txt with the latest releases. */
export function changelogLlmsSection(config: ChangelogConfig, releases: Release[], limit = 20): LlmsSection {
  return {
    title: config.label,
    links: releases.slice(0, limit).map((release) => ({
      title: releaseName(release),
      url: releaseUrl(config, release),
      description: releaseDigest(release),
    })),
  };
}
