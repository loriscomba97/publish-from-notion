/**
 * Prepares a Notion database for the kit, so nobody has to add properties by hand.
 *
 *   npm run notion:setup              add the properties the kit reads (existing ones are kept)
 *   npm run notion:setup -- --demo    also add the demo posts, with their covers and images
 *
 * Needs NOTION_TOKEN and NOTION_DATA_SOURCE (in .env.local) and a connection that can read,
 * update and insert content. Once the database is ready the site only reads: you can take the
 * update and insert capabilities away in the connection settings.
 */
import { blog } from '../src/blog.config';
import { demoBodies, demoRows, demoSvg, type DemoNode } from '../src/lib/demo/notion';
import { NOTION_API_URL, NOTION_API_VERSION } from '../src/lib/notion/client';
import type { RichText } from '../src/lib/notion/types';
import { normalizeNotionId } from '../src/lib/notion/util';

// Notion API payloads are deep, loosely shaped JSON; this script only builds and forwards them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const token = process.env.NOTION_TOKEN;
const databaseInput = process.env.NOTION_DATA_SOURCE || blog.dataSource;
const withDemo = process.argv.includes('--demo');
const id = normalizeNotionId(databaseInput);

if (!token || !id) {
  console.error('notion-setup: set NOTION_TOKEN and NOTION_DATA_SOURCE (the database link) in .env.local first.');
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
const wanted: Array<[name: string, type: string]> = [
  [p.slug, 'rich_text'],
  [p.date, 'date'],
  [p.updated, 'date'],
  [p.excerpt, 'rich_text'],
  [p.seoTitle, 'rich_text'],
  [p.metaDescription, 'rich_text'],
  [p.canonicalUrl, 'url'],
  [p.category, 'select'],
  [p.tags, 'multi_select'],
  [p.author, 'rich_text'],
  [Array.isArray(p.cover) ? (p.cover[0] ?? 'Cover') : p.cover, 'files'],
  [p.coverAlt, 'rich_text'],
  [p.aiImage, 'checkbox'],
];
if (blog.publish.type === 'checkbox') wanted.unshift([blog.publish.property, 'checkbox']);
else if (!existing[blog.publish.property]) {
  console.warn(`notion-setup: create the "${blog.publish.property}" ${blog.publish.type} property yourself (the API cannot create it).`);
}

const changes: Json = {};
const [titleName] = Object.entries(existing).find(([, value]) => value.type === 'title') ?? [];
if (titleName && titleName !== p.title) {
  const empty = ((await api('POST', `/data_sources/${sourceId}/query`, { page_size: 1 })).results ?? []).length === 0;
  if (empty) changes[titleName] = { name: p.title };
  else console.warn(`notion-setup: the title property is "${titleName}". Set properties.title to "${titleName}" in src/blog.config.ts.`);
}
for (const [name, type] of wanted) {
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
  console.log('notion-setup: done. Run it again with --demo to add the sample posts.');
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

// Pass 1: one page per demo post, reusing pages a previous run already created (same slug).
const bySlug = new Map<string, string>(
  ((await api('POST', `/data_sources/${sourceId}/query`, { page_size: 100 })).results ?? []).map((page: Json) => [
    plain(page.properties?.[p.slug]?.rich_text),
    page.id as string,
  ]),
);
const createdIds = new Map<string, string>();

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
    return { type: 'mention', mention: { page: { id: createdIds.get(item.mention.page.id) ?? item.mention.page.id } } };
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
