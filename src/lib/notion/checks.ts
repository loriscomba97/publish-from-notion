import type { Article } from './article';
import type { Release, ReleaseNotes } from './changelog';
import type { Post, SkippedRow } from './posts';

/**
 * Content checks that turn an editorial checklist into a build gate. Errors stop a production
 * build: better no deploy than a blog that silently went empty or shows a draft note to readers.
 * Warnings are printed and let the build go on.
 */

export type Issue = { level: 'error' | 'warning'; post?: string; message: string; collection?: string };

export type CheckInput = {
  /** A Notion token is set (without one, an empty blog is expected). */
  configured: boolean;
  posts: Post[];
  skipped: SkippedRow[];
  /** Rendered bodies, when the check also loads every article. */
  articles?: Article[];
  /** Name printed with each issue, for sites with several collections. */
  collection?: string;
  /** An empty collection is expected (customer stories not written yet): a warning, not an error. */
  allowEmpty?: boolean;
};

export type CheckOptions = {
  /** Markers that must never reach readers. */
  placeholders?: string[];
  maxTitleLength?: number;
  maxDescriptionLength?: number;
};

/** Notion's own file hosts: URLs from here expire, so they must never be pasted as a link. */
export const EXPIRING_NOTION_URL = /https:\/\/(?:prod-files-secure\.s3[\w.-]*\.amazonaws\.com|file\.notion\.so\/f\/|s3[\w.-]*\.amazonaws\.com\/secure\.notion-static\.com)[^\s"')<>]*/i;

export function checkContent(input: CheckInput, options: CheckOptions = {}): Issue[] {
  const placeholders = options.placeholders ?? ['[TODO', '[TK]', '[FACT-CHECK', 'lorem ipsum'];
  const maxTitle = options.maxTitleLength ?? 65;
  const maxDescription = options.maxDescriptionLength ?? 160;
  const issues: Issue[] = [];
  const tag = input.collection ? { collection: input.collection } : {};
  const error = (message: string, post?: string) => issues.push({ level: 'error', post, message, ...tag });
  const warn = (message: string, post?: string) => issues.push({ level: 'warning', post, message, ...tag });

  if (input.configured && input.posts.length === 0) {
    const message = 'Notion returned no published posts. Check NOTION_TOKEN, the data source id and the publish property, or publish a first post.';
    if (input.allowEmpty) warn(message); else error(message);
  }
  for (const row of input.skipped) error(`Published in Notion but not on the site: ${row.reason}.`, row.title);

  for (const post of input.posts) {
    const name = post.title;
    if (post.slugInput && post.slugInput !== post.slug) {
      warn(`Slug "${post.slugInput}" was cleaned up to "${post.slug}". Type it in Notion exactly as it should appear in the URL.`, name);
    }
    if (post.dateSource === 'created') warn('No publish date set: the page creation date is used instead.', name);
    const title = post.seoTitle || post.title;
    if (title.length > maxTitle) warn(`Title is ${title.length} characters; search results show about ${maxTitle}.`, name);
    const description = post.metaDescription || post.excerpt;
    if (!description) warn('No meta description or excerpt: search engines will pick their own snippet.', name);
    else if (description.length > maxDescription) warn(`Description is ${description.length} characters; keep it under ${maxDescription}.`, name);
    if (post.cover && !post.coverAlt && !post.coverIsAi) warn('The cover has no alt text, so it is treated as decorative.', name);
    if (post.cover?.kind === 'external' && EXPIRING_NOTION_URL.test(post.cover.url)) {
      error('The cover URL is a temporary Notion file link and will break within an hour. Upload the image to Notion instead, or host it elsewhere.', name);
    }
  }

  for (const article of input.articles ?? []) {
    const name = article.post.title;
    const visible = article.html.replace(/<[^>]+>/g, ' ');
    for (const marker of placeholders) {
      if (visible.toLowerCase().includes(marker.toLowerCase())) error(`The body still contains "${marker}".`, name);
    }
    if (EXPIRING_NOTION_URL.test(article.html)) error('The body links a temporary Notion file URL that will break within an hour.', name);
    if (article.unsupported.length) warn(`Not rendered: ${article.unsupported.join(', ')}.`, name);
  }
  return issues;
}

export type ReleaseCheckInput = {
  releases: Release[];
  skipped: SkippedRow[];
  /** Rendered page contents, when page bodies are on, by release id. */
  notes?: Map<string, ReleaseNotes>;
  collection?: string;
};

/** The same editorial gate for a changelog: rows that cannot go online, draft markers, temporary file links. */
export function checkReleases(input: ReleaseCheckInput, options: Pick<CheckOptions, 'placeholders'> = {}): Issue[] {
  const placeholders = options.placeholders ?? ['[TODO', '[TK]', '[FACT-CHECK', 'lorem ipsum'];
  const issues: Issue[] = [];
  const tag = input.collection ? { collection: input.collection } : {};
  const add = (level: Issue['level'], post: string, message: string) => issues.push({ level, post, message, ...tag });
  for (const row of input.skipped) add('error', row.title, `Published in Notion but not on the site: ${row.reason}.`);
  for (const release of input.releases) {
    const name = release.version && release.title ? `${release.version}: ${release.title}` : release.title || release.version;
    if (release.dateSource === 'created') add('warning', name, 'No release date set: the page creation date is used instead.');
    const notes = input.notes?.get(release.id);
    const visible = [release.summary, ...release.sections.flatMap((s) => s.items), notes?.text ?? ''].join(' ').toLowerCase();
    for (const marker of placeholders) {
      if (visible.includes(marker.toLowerCase())) add('error', name, `The notes still contain "${marker}".`);
    }
    if (notes && EXPIRING_NOTION_URL.test(notes.html)) add('error', name, 'The notes link a temporary Notion file URL that will break within an hour.');
    if (notes?.unsupported.length) add('warning', name, `Not rendered: ${notes.unsupported.join(', ')}.`);
  }
  return issues;
}

export function formatIssues(issues: Issue[]): string {
  return issues
    .map((i) => `${i.level === 'error' ? 'ERROR  ' : 'warning'}  ${i.collection ? `[${i.collection}] ` : ''}${i.post ? `"${i.post}": ` : ''}${i.message}`)
    .join('\n');
}
