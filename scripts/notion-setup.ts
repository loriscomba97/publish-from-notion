/**
 * Prepares a Notion database for the kit, so nobody has to add properties by hand.
 *
 *   npm run notion:setup                              the blog: add the properties the kit reads (existing ones are kept)
 *   npm run notion:setup -- --demo                    also add the demo posts, with their covers and images
 *   npm run notion:setup -- --collection stories      the customer stories database (NOTION_STORIES_DATA_SOURCE)
 *   npm run notion:setup -- --collection changelog    the changelog database (NOTION_CHANGELOG_DATA_SOURCE)
 *   add --demo to either for sample stories (invented people) or the kit's own releases
 *
 * Needs NOTION_TOKEN and the database link (NOTION_DATA_SOURCE for the blog, in .env.local) and a
 * connection that can read, update and insert content. Once the database is ready the site only
 * reads: you can take the update and insert capabilities away in the connection settings.
 */
import { blog, changelog, stories } from '../src/blog.config';
import { demoBodies, demoReleaseBodies, demoReleases, demoRows, demoStories, demoStoryBodies, demoSvg, type DemoNode } from '../src/lib/demo/notion';
import { NOTION_API_URL, NOTION_API_VERSION } from '../src/lib/notion/client';
import type { RichText } from '../src/lib/notion/types';
import { normalizeNotionId } from '../src/lib/notion/util';

// Notion API payloads are deep, loosely shaped JSON; this script only builds and forwards them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const token = process.env.NOTION_TOKEN;
const collectionArg = process.argv.indexOf('--collection');
const collection = collectionArg > 0 ? process.argv[collectionArg + 1] ?? '' : 'blog';
const sources: Record<string, [env: string, fallback: string]> = {
  blog: ['NOTION_DATA_SOURCE', blog.dataSource],
  stories: ['NOTION_STORIES_DATA_SOURCE', stories.dataSource],
  changelog: ['NOTION_CHANGELOG_DATA_SOURCE', changelog.dataSource],
};
if (!sources[collection]) {
  console.error(`notion-setup: unknown collection "${collection}". Use blog, stories or changelog.`);
  process.exit(1);
}
const [envName, fallback] = sources[collection];
const databaseInput = process.env[envName] || fallback;
const withDemo = process.argv.includes('--demo');
const id = normalizeNotionId(databaseInput);

if (!token || !id) {
  console.error(`notion-setup: set NOTION_TOKEN and ${envName} (the database link) in .env.local first.`);
  process.exit(1);
}

const base = (process.env.NOTION_API_URL || NOTION_API_URL).replace(/\/+$/, '');
const auth = { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_API_VERSION };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? auth : { ...auth, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const seconds = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(seconds) ? Math.min(seconds, 60) * 1000 : 500 * 2 ** attempt);
      continue;
    }
    const detail = await res.text();
    const hint = res.status === 404 ? ' Is the database connected to the connection ("..." menu > Connections > Add connection)?' : '';
    const writeHint = res.status === 403 ? ' Give the connection "Update content" and "Insert content" while you run this script.' : '';
    throw new Error(`Notion ${res.status} on ${method} ${path}: ${detail.slice(0, 300)}${hint}${writeHint}`);
  }
}

const text = (content: string) => (content ? [{ type: 'text', text: { content } }] : []);
const plain = (items: Array<{ plain_text?: string }> | undefined) => (items ?? []).map((t) => t.plain_text ?? '').join('');

// 1. Find the data source behind the database link.
async function dataSource(): Promise<Json> {
  const database = await api('GET', `/databases/${id}`).catch(() => null);
  const first = database?.data_sources?.[0]?.id as string | undefined;
  return api('GET', `/data_sources/${first ?? id}`);
}

const source = await dataSource();
const sourceId: string = source.id;
const existing: Json = source.properties ?? {};
console.log(`notion-setup: database "${plain(source.title) || 'Untitled'}" found.`);

// 2. Add the properties the kit reads.
const p = blog.properties;
const first = (names: string | string[]) => (Array.isArray(names) ? (names[0] ?? '') : names);
function articleProperties(config: typeof blog): Array<[name: string, type: string]> {
  const q = config.properties;
  return [
    [q.slug, 'rich_text'],
    [q.date, 'date'],
    [q.updated, 'date'],
    [q.excerpt, 'rich_text'],
    [q.seoTitle, 'rich_text'],
    [q.metaDescription, 'rich_text'],
    [q.canonicalUrl, 'url'],
    [q.category, 'select'],
    [q.tags, 'multi_select'],
    [q.author, 'rich_text'],
    [first(q.cover) || 'Cover', 'files'],
    [q.coverAlt, 'rich_text'],
    [q.aiImage, 'checkbox'],
    ...(q.featured ? ([[q.featured, 'checkbox']] as Array<[string, string]>) : []),
    ...Object.values(config.extra).map((name): [string, string] => [name, 'rich_text']),
    ...Object.values(config.images).map((names): [string, string] => [first(names), 'files']),
  ];
}
const target = collection === 'changelog' ? changelog : collection === 'stories' ? stories : blog;
const titleWanted = target.properties.title;
const wanted: Array<[name: string, type: string]> =
  collection === 'changelog'
    ? [
        [changelog.properties.version, 'rich_text'],
        [changelog.properties.date, 'date'],
        [changelog.properties.product, 'select'],
        [changelog.properties.summary, 'rich_text'],
        ...changelog.sections.map((section): [string, string] => [section.property, 'rich_text']),
      ]
    : articleProperties(collection === 'stories' ? stories : blog);
const publish = target.publish;
if (publish.type === 'checkbox') wanted.unshift([publish.property, 'checkbox']);
else if (!existing[publish.property]) {
  console.warn(`notion-setup: create the "${publish.property}" ${publish.type} property yourself (the API cannot create it).`);
}

const changes: Json = {};
const [titleName] = Object.entries(existing).find(([, value]) => value.type === 'title') ?? [];
if (titleName && titleName !== titleWanted) {
  const empty = ((await api('POST', `/data_sources/${sourceId}/query`, { page_size: 1 })).results ?? []).length === 0;
  if (empty) changes[titleName] = { name: titleWanted };
  else console.warn(`notion-setup: the title property is "${titleName}". Set properties.title to "${titleName}" in src/blog.config.ts.`);
}
for (const [name, type] of wanted) {
  if (!name || changes[name]) continue;
  const current = existing[name];
  if (!current) changes[name] = { [type]: type.endsWith('select') ? { options: [] } : {} };
  else if (current.type !== type) console.warn(`notion-setup: "${name}" exists as ${current.type}, the kit expects ${type}. Left as it is.`);
}
const added = Object.keys(changes);
if (added.length) {
  await api('PATCH', `/data_sources/${sourceId}`, { properties: changes });
  console.log(`notion-setup: ${added.length} property change(s): ${added.map((n) => (changes[n].name ? `"${n}" renamed to "${changes[n].name}"` : `"${n}"`)).join(', ')}.`);
} else {
  console.log('notion-setup: every property is already there.');
}

if (!withDemo) {
  console.log(collection === 'blog' ? 'notion-setup: done. Run it again with --demo to add the sample posts.' : `notion-setup: done, the ${collection} database is ready.`);
  process.exit(0);
}

// 3. Demo posts: covers and images are uploaded to Notion, like an editor would do.
async function upload(name: string): Promise<string> {
  const svg = demoSvg(name);
  if (!svg) throw new Error(`no demo image named ${name}`);
  const created = await api('POST', '/file_uploads', { mode: 'single_part', filename: name, content_type: 'image/svg+xml' });
  const form = new FormData();
  form.append('file', new Blob([svg], { type: 'image/svg+xml' }), name);
  const res = await fetch(created.upload_url ?? `${base}/file_uploads/${created.id}/send`, { method: 'POST', headers: auth, body: form });
  if (!res.ok) throw new Error(`upload of ${name} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return created.id;
}

const createdIds = new Map<string, string>();

/** Existing pages by the text of one property, so an interrupted run can be resumed. */
async function pagesBy(property: string): Promise<Map<string, string>> {
  const rows = ((await api('POST', `/data_sources/${sourceId}/query`, { page_size: 100 })).results ?? []) as Json[];
  return new Map(rows.map((row) => [plain(row.properties?.[property]?.rich_text ?? row.properties?.[property]?.title), row.id as string]));
}

/** Writes a demo body into a page that is still empty. */
async function fillBody(pageId: string, title: string, nodes: DemoNode[]): Promise<boolean> {
  if (nodes.length === 0) return false;
  if (((await api('GET', `/blocks/${pageId}/children?page_size=1`)).results ?? []).length) {
    console.log(`notion-setup: "${title}" already has content, left as it is.`);
    return false;
  }
  const blocks: Json[] = [];
  for (const node of nodes) blocks.push(await blockRequest(node));
  for (let i = 0; i < blocks.length; i += 100) await api('PATCH', `/blocks/${pageId}/children`, { children: blocks.slice(i, i + 100) });
  return true;
}

const publishedValue = (published: boolean) => (target.publish.type === 'checkbox' ? { [target.publish.property]: { checkbox: published } } : {});

if (collection === 'changelog') {
  // The kit's own releases, one page each.
  const c = changelog.properties;
  const byVersion = await pagesBy(c.version);
  let written = 0;
  for (const row of demoReleases) {
    let pageId = byVersion.get(row.version);
    if (!pageId) {
      const lists = Object.fromEntries(
        changelog.sections.map((section) => [section.property, { rich_text: text((row.changes[section.label as 'New' | 'Improved' | 'Fixed'] ?? []).join('\n')) }]),
      );
      const page = await api('POST', '/pages', {
        parent: { type: 'data_source_id', data_source_id: sourceId },
        properties: {
          [c.title]: { title: text(row.name) },
          [c.version]: { rich_text: text(row.version) },
          [c.date]: { date: { start: row.date } },
          [c.summary]: { rich_text: text(row.summary) },
          ...lists,
          ...publishedValue(true),
        },
      });
      pageId = page.id as string;
    }
    if (await fillBody(pageId, row.name, demoReleaseBodies[row.id] ?? [])) written++;
    console.log(`notion-setup: release ${row.version} is there.`);
  }
  console.log(`notion-setup: done, ${demoReleases.length} release(s) in the changelog, ${written} page body(ies) written.`);
  process.exit(0);
}

if (collection === 'stories') {
  // Links from the stories to the demo posts resolve when the blog demo is in the blog database.
  const blogInput = process.env.NOTION_DATA_SOURCE || blog.dataSource;
  const blogId = normalizeNotionId(blogInput);
  if (blogId) {
    const database = await api('GET', `/databases/${blogId}`).catch(() => null);
    const blogSource = (database?.data_sources?.[0]?.id as string | undefined) ?? blogId;
    const rows = ((await api('POST', `/data_sources/${blogSource}/query`, { page_size: 100 }).catch(() => ({ results: [] }))).results ?? []) as Json[];
    const bySlugInBlog = new Map(rows.map((row) => [plain(row.properties?.[p.slug]?.rich_text), row.id as string]));
    for (const row of demoRows) {
      const found = bySlugInBlog.get(row.slug);
      if (found) createdIds.set(row.id, found);
    }
  }
  const q = stories.properties;
  const bySlugInStories = await pagesBy(q.slug);
  let written = 0;
  for (const row of demoStories) {
    let pageId = bySlugInStories.get(row.slug);
    if (!pageId) {
      const page = await api('POST', '/pages', {
        parent: { type: 'data_source_id', data_source_id: sourceId },
        cover: { type: 'file_upload', file_upload: { id: await upload(row.cover) } },
        properties: {
          [q.title]: { title: text(row.title) },
          [q.slug]: { rich_text: text(row.slug) },
          [q.date]: { date: { start: row.date } },
          [q.excerpt]: { rich_text: text(row.excerpt) },
          [q.coverAlt]: { rich_text: text(row.coverAlt) },
          ...(q.featured ? { [q.featured]: { checkbox: row.featured } } : {}),
          ...(stories.extra.customer ? { [stories.extra.customer]: { rich_text: text(row.customer) } } : {}),
          ...(stories.extra.role ? { [stories.extra.role]: { rich_text: text(row.role) } } : {}),
          ...(stories.extra.company ? { [stories.extra.company]: { rich_text: text(row.company) } } : {}),
          ...(stories.extra.quote ? { [stories.extra.quote]: { rich_text: text(row.quote) } } : {}),
          ...(stories.images.avatar ? { [first(stories.images.avatar)]: { files: [{ type: 'file_upload', file_upload: { id: await upload(row.avatar) }, name: row.avatar }] } } : {}),
          ...publishedValue(true),
        },
      });
      pageId = page.id as string;
    }
    if (await fillBody(pageId, row.title, demoStoryBodies[row.id] ?? [])) written++;
    console.log(`notion-setup: story "${row.title}" is there.`);
  }
  console.log(`notion-setup: done, ${demoStories.length} sample stor${demoStories.length === 1 ? 'y' : 'ies'}, ${written} page body(ies) written. The companies and people in them are invented.`);
  process.exit(0);
}

// Pass 1: one page per demo post, reusing pages a previous run already created (same slug).
const bySlug = new Map<string, string>(
  ((await api('POST', `/data_sources/${sourceId}/query`, { page_size: 100 })).results ?? []).map((page: Json) => [
    plain(page.properties?.[p.slug]?.rich_text),
    page.id as string,
  ]),
);
for (const row of demoRows) {
  const existingId = bySlug.get(row.slug);
  if (existingId) {
    createdIds.set(row.id, existingId);
    continue;
  }
  const page = await api('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: sourceId },
    cover: { type: 'file_upload', file_upload: { id: await upload(row.cover) } },
    properties: {
      [p.title]: { title: text(row.title) },
      [p.slug]: { rich_text: text(row.slug) },
      ...(blog.publish.type === 'checkbox' ? { [blog.publish.property]: { checkbox: row.published } } : {}),
      [p.date]: { date: { start: row.date } },
      [p.excerpt]: { rich_text: text(row.excerpt) },
      [p.category]: { select: { name: row.category } },
      [p.tags]: { multi_select: row.tags.map((name) => ({ name })) },
      [p.author]: { rich_text: text('Demo Team') },
      [p.coverAlt]: { rich_text: text(row.coverAlt) },
      [p.aiImage]: { checkbox: row.ai === true },
    },
  });
  createdIds.set(row.id, page.id);
}

function richTextRequest(item: RichText): Json {
  if (item.type === 'mention' && item.mention?.page) {
    const id = createdIds.get(item.mention.page.id);
    // A mention of a demo post that is not in this workspace becomes plain text.
    if (!id) return { type: 'text', text: { content: item.plain_text }, annotations: item.annotations ?? {} };
    return { type: 'mention', mention: { page: { id } } };
  }
  return { type: 'text', text: { content: item.plain_text, link: item.href ? { url: item.href } : null }, annotations: item.annotations ?? {} };
}

async function blockRequest(node: DemoNode): Promise<Json> {
  const { block, children } = node;
  const type = block.type;
  const data: Json = { ...(block[type] as Json) };
  if (Array.isArray(data.rich_text)) data.rich_text = data.rich_text.map(richTextRequest);
  if (Array.isArray(data.caption)) data.caption = data.caption.map(richTextRequest);
  if (type === 'table_row') data.cells = (data.cells as RichText[][]).map((cell) => cell.map(richTextRequest));
  if (type === 'image') {
    const name = new URL(data.file.url as string).pathname.slice(1);
    return { object: 'block', type, image: { type: 'file_upload', file_upload: { id: await upload(name) }, caption: data.caption ?? [] } };
  }
  if (children.length) {
    data.children = [];
    for (const child of children) data.children.push(await blockRequest(child));
  }
  return { object: 'block', type, [type]: data };
}

// Pass 2: bodies, only for pages that are still empty, so an interrupted run can be resumed.
// Links between posts resolve now that every page exists.
let filled = 0;
for (const row of demoRows) {
  const pageId = createdIds.get(row.id);
  if (!pageId) continue;
  if (((await api('GET', `/blocks/${pageId}/children?page_size=1`)).results ?? []).length) {
    console.log(`notion-setup: "${row.title}" already has content, left as it is.`);
    continue;
  }
  filled++;
  const blocks: Json[] = [];
  for (const node of demoBodies[row.id] ?? []) blocks.push(await blockRequest(node));
  for (let i = 0; i < blocks.length; i += 100) {
    await api('PATCH', `/blocks/${pageId}/children`, { children: blocks.slice(i, i + 100) });
  }
  console.log(`notion-setup: added "${row.title}"${row.published ? '' : ' (not published, to show that drafts stay private)'}.`);
}

console.log(`notion-setup: done, ${filled} demo post(s) written.`);
