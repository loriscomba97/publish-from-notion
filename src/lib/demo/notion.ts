import type { NotionBlock, NotionPage, RichText } from '../notion/types';

/**
 * A small, in-memory stand-in for the Notion API, so the template runs before Notion is
 * connected: `npm run dev` without a token, or NOTION_DEMO=1. Every post, id and image here is
 * made up, and the published posts double as a tour of the kit.
 */

let sequence = 0;
const nextId = () => `de000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
const EDITED = '2026-09-24T09:00:00.000Z';

type Marks = { bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean; underline?: boolean; href?: string };
const t = (text: string, marks: Marks = {}): RichText => {
  const { href, ...annotations } = marks;
  return { type: 'text', plain_text: text, href: href ?? null, annotations };
};
const mention = (text: string, pageId: string): RichText => ({
  type: 'mention',
  plain_text: text,
  href: `https://www.notion.so/${pageId.replace(/-/g, '')}`,
  mention: { type: 'page', page: { id: pageId } },
});

export type DemoNode = { block: NotionBlock; children: DemoNode[] };
const b = (type: string, data: Record<string, unknown>, children: DemoNode[] = []): DemoNode => ({
  block: { object: 'block', id: nextId(), type, has_children: children.length > 0, last_edited_time: EDITED, [type]: data } as NotionBlock,
  children,
});
const p = (...rich: RichText[]) => b('paragraph', { rich_text: rich });
const h = (level: 1 | 2 | 3, text: string) => b(`heading_${level}`, { rich_text: [t(text)], is_toggleable: false });
const li = (text: string | RichText[], children: DemoNode[] = []) => b('bulleted_list_item', { rich_text: typeof text === 'string' ? [t(text)] : text }, children);
const ol = (text: string) => b('numbered_list_item', { rich_text: [t(text)] });
const todo = (text: string, checked: boolean) => b('to_do', { rich_text: [t(text)], checked });
const toggle = (text: string, ...children: DemoNode[]) => b('toggle', { rich_text: [t(text)] }, children);
const callout = (emoji: string, text: string) => b('callout', { rich_text: [t(text)], icon: { type: 'emoji', emoji } });
const quote = (text: string) => b('quote', { rich_text: [t(text)] });
const code = (language: string, source: string) => b('code', { rich_text: [t(source)], language, caption: [] });
const image = (file: string, caption: string) => b('image', { type: 'file', file: { url: fileUrl(file) }, caption: [t(caption)] });
const table = (rows: string[][]) =>
  b(
    'table',
    { table_width: rows[0]?.length ?? 0, has_column_header: true, has_row_header: false },
    rows.map((cells) => b('table_row', { cells: cells.map((c) => [t(c)]) })),
  );

const fileUrl = (name: string) => `https://files.demo.invalid/${name}?X-Amz-Expires=3600`;

export type DemoRow = { id: string; title: string; slug: string; date: string; published: boolean; excerpt: string; category: string; tags: string[]; cover: string; coverAlt: string; ai?: boolean };

function pageOf(row: DemoRow): NotionPage {
  const text = (value: string, id: string) => ({ id, type: 'rich_text', rich_text: value ? [t(value)] : [] });
  return {
    object: 'page',
    id: row.id,
    created_time: `${row.date}T08:00:00.000Z`,
    last_edited_time: EDITED,
    cover: { type: 'file', file: { url: fileUrl(row.cover) } },
    properties: {
      Name: { id: 'title', type: 'title', title: [t(row.title)] },
      Slug: text(row.slug, 'slug'),
      Published: { id: 'pub', type: 'checkbox', checkbox: row.published },
      'Published date': { id: 'date', type: 'date', date: { start: row.date, end: null } },
      Excerpt: text(row.excerpt, 'exc'),
      Category: { id: 'cat', type: 'select', select: { name: row.category } },
      Tags: { id: 'tags', type: 'multi_select', multi_select: row.tags.map((name) => ({ name })) },
      Author: text('Demo Team', 'auth'),
      'Cover alt': text(row.coverAlt, 'alt'),
      'AI image': { id: 'ai', type: 'checkbox', checkbox: row.ai === true },
    },
  };
}

const ids = { checkbox: nextId(), instant: nextId(), blocks: nextId(), search: nextId(), draft: nextId() };

export const demoRows: DemoRow[] = [
  {
    id: ids.checkbox,
    title: 'Your CMS is a checkbox',
    slug: 'your-cms-is-a-checkbox',
    date: '2026-09-24',
    published: true,
    excerpt: 'Write in Notion, tick Published, and the post is live on your own site, with the SEO already done.',
    category: 'Guides',
    tags: ['notion', 'publishing'],
    cover: 'cover-checkbox.svg',
    coverAlt: 'Abstract shapes in blue and coral on a warm white background.',
  },
  {
    id: ids.instant,
    title: 'Instant publishing, with or without Notion automations',
    slug: 'instant-publishing',
    date: '2026-09-22',
    published: true,
    excerpt: 'Three ways for Notion to tell your site that a post changed, from a few seconds to a safety net.',
    category: 'Guides',
    tags: ['webhooks', 'publishing'],
    cover: 'cover-instant.svg',
    coverAlt: 'Concentric rings in green and teal suggesting a signal spreading outward.',
  },
  {
    id: ids.blocks,
    title: 'Every block, rendered',
    slug: 'every-block-rendered',
    date: '2026-09-18',
    published: true,
    excerpt: 'A tour of the Notion blocks the kit turns into clean, accessible HTML.',
    category: 'Reference',
    tags: ['notion', 'blocks'],
    cover: 'cover-blocks.svg',
    coverAlt: 'A grid of rounded tiles in muted yellow, violet and blue.',
  },
  {
    id: ids.search,
    title: 'Writing for search engines and AI assistants',
    slug: 'search-and-ai',
    date: '2026-09-15',
    published: true,
    excerpt: 'What the kit generates for crawlers, and the few Notion fields worth filling in.',
    category: 'Guides',
    tags: ['seo', 'publishing'],
    cover: 'cover-search.svg',
    coverAlt: 'Soft overlapping circles in purple and orange on a dark background.',
    ai: true,
  },
  {
    id: ids.draft,
    title: 'Draft: this post is not published',
    slug: 'unpublished-draft',
    date: '2026-09-25',
    published: false,
    excerpt: 'Drafts never leave Notion: the query only asks for published rows.',
    category: 'Guides',
    tags: [],
    cover: 'cover-checkbox.svg',
    coverAlt: '',
  },
];

export const demoBodies: Record<string, DemoNode[]> = {
  [ids.checkbox]: [
    p(t('This site has no admin panel. Every post you are reading was written in a Notion database, and went live the moment someone ticked a checkbox.')),
    h(1, 'How it works'),
    ol('Write the post as a page in your Notion database.'),
    ol('Tick Published.'),
    ol('Notion calls the site’s webhook, and the site refreshes the post list and that one page.'),
    ol('The next visitor gets the new page, already rendered as static HTML.'),
    callout('💡', 'Untick Published and the post leaves the site, the sitemap and the feed at the next refresh.'),
    h(1, 'What you get'),
    li('Posts on your own domain, under /blog, not on a subdomain or someone else’s platform.'),
    li('Drafts that stay private: the kit reads Notion through the official API, so nothing has to be shared to the web.'),
    li('Metadata, structured data, a sitemap, an RSS feed and llms.txt, all generated from the same post.'),
    li('Zero core runtime dependencies: one folder of TypeScript you can read in an afternoon.'),
    quote('The best CMS is the one your team already writes in.'),
    p(t('Next: '), mention('Instant publishing, with or without Notion automations', ids.instant), t('.')),
  ],
  [ids.instant]: [
    p(t('There are three ways for Notion to tell your site that something changed. Use the fastest one you can; the timed refresh is always there as a safety net.')),
    table([
      ['Way', 'Needs Notion automations', 'Speed', 'Also catches text edits'],
      ['Database automation', 'Yes', 'Asynchronous', 'No, property changes only'],
      ['Integration webhook', 'No', 'Delivery varies', 'Yes'],
      ['Timed refresh', 'No', 'After cache expiry and a visit', 'Yes'],
    ]),
    h(1, 'Database automation'),
    p(t('In the database, add an automation: when '), t('Published', { bold: true }), t(' is checked, send a webhook to your site with one custom header.')),
    code('plain text', 'POST https://your-site.example/api/notion-webhook\nX-Webhook-Secret: <NOTION_AUTOMATION_SECRET>'),
    h(1, 'Integration webhook'),
    p(t('In your integration’s settings, open Webhooks and create a subscription that points at the same URL. Notion signs every event with the subscription’s verification token, and the site checks the signature before doing anything.')),
    h(1, 'Timed refresh'),
    p(t('The cache can refresh on a visit after its one-hour interval. This is a fallback, not a scheduled background sync.')),
    toggle('What if two events arrive at once?', p(t('Each one only marks cached data as stale. Refreshing twice is harmless.'))),
  ],
  [ids.blocks]: [
    b('table_of_contents', {}),
    h(1, 'Text'),
    p(
      t('Paragraphs keep '),
      t('bold', { bold: true }),
      t(', '),
      t('italic', { italic: true }),
      t(', '),
      t('inline code', { code: true }),
      t(', '),
      t('strikethrough', { strikethrough: true }),
      t(' and '),
      t('links', { href: 'https://developers.notion.com' }),
      t('. Links to other posts in the workspace become links to their pages on this site.'),
    ),
    h(2, 'Lists'),
    li('Bulleted lists', [li('with nested items')]),
    li('stay semantic'),
    ol('Numbered lists too'),
    todo('To-dos render as a checklist', true),
    todo('Unchecked items stay unchecked', false),
    h(1, 'Media'),
    image('diagram.svg', 'Images uploaded to Notion are served through your site, without exposing the temporary upstream file URL.'),
    h(1, 'Code'),
    code('typescript', "const posts = await getPosts(client, config);\nconst article = await loadArticle(client, config, posts[0], { imageKey, posts });"),
    h(1, 'Structure'),
    b('column_list', {}, [
      b('column', {}, [p(t('Columns sit side by side on wide screens…'))]),
      b('column', {}, [p(t('…and stack on phones.'))]),
    ]),
    callout('📌', 'Callouts keep their icon.'),
    quote('Quotes stay quotes.'),
    b('divider', {}),
    h(1, 'Tables'),
    table([
      ['Block', 'Rendered as'],
      ['Toggle', 'details and summary'],
      ['Callout', 'a note with its icon'],
      ['Embed', 'a privacy-friendly player or a link'],
    ]),
    h(1, 'FAQ'),
    toggle(
      'Which blocks are supported?',
      p(t('Text, headings, lists, to-dos, toggles, quotes, callouts, code, images, video embeds, bookmarks, tables, columns, dividers, equations and tables of contents.')),
    ),
    toggle('What happens to a block that is not supported?', p(t('It is left out of the page and reported by the content check, so it never disappears silently.'))),
    toggle('Do embeds load third-party scripts?', p(t('No. YouTube and Vimeo become privacy-friendly players that load lazily; other embeds become plain links.'))),
  ],
  [ids.search]: [
    p(t('Every post page ships complete in the HTML: title, description, canonical URL and structured data, built from the same Notion row that renders the article.')),
    h(1, 'Fields worth filling in'),
    li([t('SEO title', { bold: true }), t(' and '), t('Meta description', { bold: true }), t(': optional overrides for search results.')]),
    li([t('Cover alt', { bold: true }), t(': a plain description of the cover. Leave it empty only for decorative images.')]),
    li([t('AI image', { bold: true }), t(': tick it for generated covers, and the alt text says so.')]),
    h(1, 'What crawlers get'),
    li('BlogPosting, breadcrumb and site data in one JSON-LD graph.'),
    li('A FAQPage block when the post has a real FAQ section.'),
    li('A sitemap, an RSS feed and llms.txt, generated from the same post list.'),
    callout('ℹ️', 'None of this is a ranking trick. It describes your pages accurately, which is what search engines and assistants need.'),
  ],
  [ids.draft]: [p(t('If you can read this on the site, the publish filter is broken.'))],
};

// Index everything the API can be asked for. Exported so the local mock server can edit posts.
export const pages = new Map(demoRows.map((row) => [row.id, pageOf(row)]));
const blocks = new Map<string, NotionBlock>();
const children = new Map<string, NotionBlock[]>();
function index(parentId: string, nodes: DemoNode[]) {
  children.set(parentId, nodes.map((n) => n.block));
  for (const n of nodes) {
    blocks.set(n.block.id, n.block);
    if (n.children.length) index(n.block.id, n.children);
  }
}
for (const [pageId, nodes] of Object.entries(demoBodies)) index(pageId, nodes);

// Covers and images, drawn in code: no files to license, nothing fetched from the internet.
const PALETTES: Record<string, [string, string, string, string]> = {
  'cover-checkbox.svg': ['#f4efe6', '#2b59c3', '#ef7a5a', '#1d1c19'],
  'cover-instant.svg': ['#e9f2ee', '#1f8a70', '#62c3b1', '#12403a'],
  'cover-blocks.svg': ['#f3f0fa', '#e8b94a', '#7b61c9', '#3d6fd6'],
  'cover-search.svg': ['#1b1830', '#8f6ef0', '#f39a52', '#f4eee6'],
  'diagram.svg': ['#f7f6f2', '#2b59c3', '#ef7a5a', '#6d6a63'],
};

export function demoSvg(name: string): string | null {
  const colors = PALETTES[name];
  if (!colors) return null;
  const [bg, a, c, d] = colors;
  if (name === 'diagram.svg') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520"><rect width="1200" height="520" fill="${bg}"/><g font-family="system-ui, sans-serif" font-size="30" font-weight="600" text-anchor="middle"><rect x="70" y="190" width="260" height="140" rx="24" fill="#fff" stroke="${d}" stroke-width="3"/><text x="200" y="270" fill="${d}">Notion</text><rect x="470" y="190" width="260" height="140" rx="24" fill="${a}"/><text x="600" y="270" fill="#fff">Webhook</text><rect x="870" y="190" width="260" height="140" rx="24" fill="${c}"/><text x="1000" y="270" fill="#fff">Your site</text></g><g stroke="${d}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M340 260h110m-18-16 18 16-18 16"/><path d="M740 260h110m-18-16 18 16-18 16"/></g></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="${bg}"/><circle cx="1180" cy="330" r="300" fill="${a}" opacity=".9"/><circle cx="480" cy="640" r="260" fill="${c}" opacity=".85"/><rect x="640" y="180" width="360" height="360" rx="72" fill="${d}" opacity=".9" transform="rotate(12 820 360)"/><circle cx="300" cy="220" r="70" fill="${a}" opacity=".5"/></svg>`;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const notFound = () => json(404, { object: 'error', status: 404, code: 'object_not_found', message: 'Not in the demo workspace.' });
const list = (results: unknown[]) => json(200, { object: 'list', results, has_more: false, next_cursor: null });

type Filter = { property?: string; checkbox?: { equals?: boolean } };

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? 'GET').toUpperCase();
  if (process.env.NOTION_DEMO_LOG === '1') console.log(`[demo notion] ${method} ${url.hostname}${url.pathname}`);

  if (url.hostname === 'files.demo.invalid') {
    const body = demoSvg(url.pathname.slice(1));
    return body ? new Response(body, { status: 200, headers: { 'content-type': 'image/svg+xml' } }) : new Response('Not found', { status: 404 });
  }

  const path = url.pathname.replace(/^\/v1/, '');
  const id = (value: string | undefined) => (value ?? '').toLowerCase();
  let match: RegExpMatchArray | null;

  if (method === 'POST' && /^\/data_sources\/[^/]+\/query$/.test(path)) {
    const filter = (JSON.parse(String(init?.body ?? '{}')) as { filter?: Filter }).filter;
    const results = [...pages.values()].filter((page) => {
      if (!filter?.property || filter.checkbox?.equals === undefined) return true;
      const value = page.properties[filter.property];
      return value?.type === 'checkbox' && value.checkbox === filter.checkbox.equals;
    });
    return list(results);
  }
  if (method === 'GET' && (match = path.match(/^\/blocks\/([^/]+)\/children$/))) return list(children.get(id(match[1])) ?? []);
  if (method === 'GET' && (match = path.match(/^\/pages\/([^/]+)$/))) {
    const page = pages.get(id(match[1]));
    return page ? json(200, page) : notFound();
  }
  if (method === 'GET' && (match = path.match(/^\/blocks\/([^/]+)$/))) {
    const block = blocks.get(id(match[1]));
    return block ? json(200, block) : notFound();
  }
  return notFound();
}
