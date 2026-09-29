import type { BlockNode } from './blocks';
import type {
  CalloutPayload,
  CodePayload,
  EquationPayload,
  HeadingPayload,
  LinkPayload,
  LinkToPagePayload,
  NotionBlock,
  NotionFile,
  RichText,
  TablePayload,
  TableRowPayload,
  TextPayload,
  ToDoPayload,
} from './types';
import { compactId, escapeHtml, normalizeNotionId, prettyUrl, safeHref, safeSrc, slugify } from './util';

/**
 * Notion blocks to semantic HTML, as a pure function of the block tree.
 *
 * Safety: every piece of text is escaped, and links pass through safeHref, so a `javascript:`
 * link typed in Notion never reaches the page. Links to pages of your workspace are rewritten to
 * the matching post, or dropped when the page is not a published post, so private workspace
 * URLs never leak into public HTML.
 *
 * Structure: the page title is the only h1, so Notion headings are shifted down one level and
 * get stable, unique ids for anchors and a table of contents. Unknown block types are reported
 * in `unsupported` (and left as an HTML comment) instead of vanishing silently.
 */

export type Heading = { id: string; text: string; level: number };

export type PageLink = { href: string; title: string };

export type RenderOptions = {
  /** Notion heading 1 renders as h(1 + offset). Default 1. */
  headingOffset?: number;
  /** Signed URLs for images uploaded to Notion, keyed by compact block id. */
  imageUrls?: ReadonlyMap<string, string>;
  /** Maps a linked Notion page to its public URL, or null when it is not on the site. */
  resolvePage?: (pageId: string) => PageLink | null;
  /** Ids already used by the surrounding page layout, never reused for headings. */
  reservedIds?: string[];
};

export type RenderResult = {
  html: string;
  headings: Heading[];
  /** Visible text, for reading time and search snippets. */
  text: string;
  unsupported: string[];
};

type Context = {
  offset: number;
  imageUrls: ReadonlyMap<string, string>;
  resolvePage: (pageId: string) => PageLink | null;
  usedIds: Set<string>;
  headings: Heading[];
  text: string[];
  unsupported: Set<string>;
};

const TOC_MARKER = '<!--notion:toc-->';
const LIST_ITEM: Record<string, 'ul' | 'ol'> = { bulleted_list_item: 'ul', numbered_list_item: 'ol', to_do: 'ul' };

export function renderBlocks(nodes: BlockNode[], options: RenderOptions = {}): RenderResult {
  const ctx: Context = {
    offset: options.headingOffset ?? 1,
    imageUrls: options.imageUrls ?? new Map(),
    resolvePage: options.resolvePage ?? (() => null),
    usedIds: new Set(options.reservedIds ?? ['main', 'content', 'top', 'header', 'footer', 'nav']),
    headings: [],
    text: [],
    unsupported: new Set(),
  };
  let html = renderChildren(nodes, ctx);
  if (html.includes(TOC_MARKER)) html = html.split(TOC_MARKER).join(renderToc(ctx.headings));
  return {
    html,
    headings: ctx.headings,
    text: ctx.text.join(' ').replace(/\s+/g, ' ').trim(),
    unsupported: Array.from(ctx.unsupported),
  };
}

export function plainText(items: RichText[] | undefined): string {
  return (items ?? []).map((t) => t.plain_text).join('');
}

const payload = <T>(block: NotionBlock) => block[block.type] as T;

function renderChildren(nodes: BlockNode[], ctx: Context): string {
  const out: string[] = [];
  let list: { type: string; items: string[] } | null = null;
  for (const node of nodes) {
    const type = node.block.type;
    if (type in LIST_ITEM) {
      if (list && list.type !== type) {
        out.push(wrapList(list.type, list.items));
        list = null;
      }
      list ??= { type, items: [] };
      list.items.push(renderBlock(node, ctx));
      continue;
    }
    if (list) {
      out.push(wrapList(list.type, list.items));
      list = null;
    }
    const html = renderBlock(node, ctx);
    if (html) out.push(html);
  }
  if (list) out.push(wrapList(list.type, list.items));
  return out.join('\n');
}

function wrapList(type: string, items: string[]): string {
  if (type === 'to_do') return `<ul class="todo-list">${items.join('')}</ul>`;
  const tag = LIST_ITEM[type] ?? 'ul';
  return `<${tag}>${items.join('')}</${tag}>`;
}

function renderBlock(node: BlockNode, ctx: Context): string {
  const { block, children } = node;
  const inner = () => renderChildren(children, ctx);
  const text = (items: RichText[] | undefined) => renderRichText(items, ctx);

  switch (block.type) {
    case 'paragraph': {
      const rt = payload<TextPayload>(block).rich_text;
      const video = soleVideoLink(rt);
      if (video) return video;
      const html = text(rt);
      const nested = inner();
      return `${html ? `<p>${html}</p>` : ''}${nested ? `<div class="indent">${nested}</div>` : ''}`;
    }

    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const rt = payload<HeadingPayload>(block).rich_text;
      const label = plainText(rt).trim();
      if (!label) return '';
      const level = Math.min(6, Number(block.type.slice(-1)) + ctx.offset);
      const id = uniqueId(label, ctx);
      ctx.headings.push({ id, text: label, level });
      const heading = `<h${level} id="${id}">${text(rt)}</h${level}>`;
      return payload<HeadingPayload>(block).is_toggleable ? `<details><summary>${heading}</summary>${inner()}</details>` : heading;
    }

    case 'bulleted_list_item':
    case 'numbered_list_item':
      return `<li>${text(payload<TextPayload>(block).rich_text)}${inner()}</li>`;

    case 'to_do': {
      const todo = payload<ToDoPayload>(block);
      const checked = todo.checked ? ' checked' : '';
      return `<li class="todo"><input type="checkbox" disabled${checked}> ${text(todo.rich_text)}${inner()}</li>`;
    }

    case 'toggle':
      return `<details><summary>${text(payload<TextPayload>(block).rich_text)}</summary>${inner()}</details>`;

    case 'quote': {
      const html = text(payload<TextPayload>(block).rich_text);
      return `<blockquote>${html ? `<p>${html}</p>` : ''}${inner()}</blockquote>`;
    }

    case 'callout': {
      const callout = payload<CalloutPayload>(block);
      const icon =
        callout.icon && callout.icon.type === 'emoji' && 'emoji' in callout.icon
          ? `<span class="callout-icon" aria-hidden="true">${escapeHtml(callout.icon.emoji)}</span>`
          : '';
      const html = text(callout.rich_text);
      return `<div class="callout" role="note">${icon}<div class="callout-body">${html ? `<p>${html}</p>` : ''}${inner()}</div></div>`;
    }

    case 'code': {
      const code = payload<CodePayload>(block);
      const language = (code.language || 'plain text').toLowerCase().replace(/[^a-z0-9+#]+/g, '-');
      const pre = `<pre><code class="language-${language}">${escapeHtml(plainText(code.rich_text))}</code></pre>`;
      const caption = text(code.caption);
      return caption ? `<figure class="code">${pre}<figcaption>${caption}</figcaption></figure>` : pre;
    }

    case 'divider':
      return '<hr>';

    case 'image': {
      const image = payload<NotionFile>(block);
      const src = image.type === 'external' ? safeSrc(image.external.url) : (ctx.imageUrls.get(compactId(block.id)) ?? null);
      if (!src) {
        ctx.unsupported.add('image without a usable source');
        return '';
      }
      const alt = plainText(image.caption).trim();
      const caption = text(image.caption);
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }

    case 'video': {
      const video = payload<NotionFile>(block);
      const url = video.type === 'external' ? video.external.url : '';
      const embed = videoEmbed(url, text(video.caption), plainText(video.caption));
      if (embed) return embed;
      const src = safeSrc(url);
      if (src && /\.(mp4|webm|mov|ogv)(?:[?#]|$)/i.test(src)) {
        const caption = text(video.caption);
        return `<figure><video controls preload="metadata" src="${escapeHtml(src)}"></video>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      }
      if (src) return linkParagraph(src, text(video.caption));
      ctx.unsupported.add('video uploaded to Notion');
      return '';
    }

    case 'embed':
    case 'bookmark':
    case 'link_preview': {
      const link = payload<LinkPayload>(block);
      const caption = text(link.caption);
      const embed = videoEmbed(link.url, caption, plainText(link.caption));
      if (embed) return embed;
      const href = safeHref(link.url);
      return href ? linkParagraph(href, caption, 'bookmark') : '';
    }

    case 'file':
    case 'pdf':
    case 'audio': {
      const file = payload<NotionFile>(block);
      const href = file.type === 'external' ? safeSrc(file.external.url) : null;
      if (!href) {
        ctx.unsupported.add(`${block.type} uploaded to Notion`);
        return '';
      }
      const caption = text(file.caption);
      if (block.type === 'audio') {
        return `<figure><audio controls preload="none" src="${escapeHtml(href)}"></audio>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      }
      return linkParagraph(href, caption || escapeHtml(file.name || prettyUrl(href)), 'file');
    }

    case 'table': {
      const table = payload<TablePayload>(block);
      const rows = children.filter((c) => c.block.type === 'table_row').map((c) => payload<TableRowPayload>(c.block).cells);
      if (!rows.length) return '';
      const cell = (tag: 'th' | 'td', rt: RichText[], scope = '') => `<${tag}${scope ? ` scope="${scope}"` : ''}>${text(rt)}</${tag}>`;
      const row = (cells: RichText[][]) =>
        `<tr>${cells.map((c, i) => (table.has_row_header && i === 0 ? cell('th', c, 'row') : cell('td', c))).join('')}</tr>`;
      const [first, ...rest] = rows;
      const head = table.has_column_header && first ? `<thead><tr>${first.map((c) => cell('th', c, 'col')).join('')}</tr></thead>` : '';
      const body = (table.has_column_header ? rest : rows).map(row).join('');
      return `<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`;
    }

    case 'table_row':
      return ''; // rendered by its table

    case 'column_list':
      return `<div class="columns">${children.map((c) => `<div class="column">${renderChildren(c.children, ctx)}</div>`).join('')}</div>`;

    case 'column':
      return `<div class="column">${inner()}</div>`;

    case 'synced_block':
      return inner();

    case 'equation':
      return `<pre class="equation"><code>${escapeHtml(payload<EquationPayload>(block).expression)}</code></pre>`;

    case 'table_of_contents':
      return TOC_MARKER;

    case 'link_to_page': {
      const target = payload<LinkToPagePayload>(block);
      const page = target.type === 'page_id' ? ctx.resolvePage(target.page_id) : null;
      return page ? `<p><a href="${escapeHtml(page.href)}">${escapeHtml(page.title)}</a></p>` : '';
    }

    case 'child_page':
    case 'child_database':
    case 'breadcrumb':
      return ''; // workspace navigation, not article content

    default: {
      const type = block.type.replace(/[^a-z0-9_]/gi, '');
      ctx.unsupported.add(type);
      return `<!-- unsupported Notion block: ${type} -->`;
    }
  }
}

function renderRichText(items: RichText[] | undefined, ctx: Context): string {
  let html = '';
  for (const item of items ?? []) {
    ctx.text.push(item.plain_text);
    let piece =
      item.type === 'equation' && item.equation
        ? `<code class="equation">${escapeHtml(item.equation.expression)}</code>`
        : escapeHtml(item.plain_text).replace(/\n/g, '<br>');
    const a = item.annotations ?? {};
    if (a.code && item.type !== 'equation') piece = `<code>${piece}</code>`;
    if (a.bold) piece = `<strong>${piece}</strong>`;
    if (a.italic) piece = `<em>${piece}</em>`;
    if (a.strikethrough) piece = `<s>${piece}</s>`;
    if (a.underline) piece = `<u>${piece}</u>`;
    const href = linkOf(item, ctx);
    if (href) {
      const external = !href.startsWith('/') && !href.startsWith('#');
      piece = `<a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ''}>${piece}</a>`;
    }
    html += piece;
  }
  return html;
}

const WORKSPACE_LINK = /^https?:\/\/(?:www\.)?(?:notion\.so|(?:app\.)?notion\.com)\//i;

/** Link target of a rich text run, after workspace links are mapped to posts or dropped. */
function linkOf(item: RichText, ctx: Context): string | null {
  if (item.type === 'mention') {
    if (item.mention?.type === 'page' && item.mention.page) return ctx.resolvePage(item.mention.page.id)?.href ?? null;
    if (item.mention?.type === 'user' || item.mention?.type === 'database') return null;
  }
  if (!item.href) return null;
  // Relative links such as "/1a2b3c..." or "/p/1a2b3c..." point inside the workspace.
  const relative = item.href.match(/^\/(?:p\/)?(?:[^/?#]*-)?([0-9a-f]{32})(?:[?#].*)?$/i);
  if (relative?.[1]) return ctx.resolvePage(relative[1])?.href ?? null;
  // Links to the Notion app (notion.so, app.notion.com) are workspace links: rewritten to the post,
  // or dropped. Published Notion sites (*.notion.site) are public by definition and are kept.
  if (WORKSPACE_LINK.test(item.href)) {
    const id = normalizeNotionId(item.href);
    return (id ? ctx.resolvePage(id)?.href : null) ?? null;
  }
  return safeHref(item.href);
}

function uniqueId(label: string, ctx: Context): string {
  const base = slugify(label, 'section');
  let id = base;
  for (let n = 2; ctx.usedIds.has(id); n++) id = `${base}-${n}`;
  ctx.usedIds.add(id);
  return id;
}

function renderToc(headings: Heading[]): string {
  if (!headings.length) return '';
  const top = Math.min(...headings.map((h) => h.level));
  const items = headings
    .map((h) => `<li class="toc-level-${h.level - top + 1}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
    .join('');
  return `<nav class="toc" aria-label="Contents"><ol>${items}</ol></nav>`;
}

function linkParagraph(href: string, labelHtml: string, className = ''): string {
  const external = !href.startsWith('/') && !href.startsWith('#');
  return `<p${className ? ` class="${className}"` : ''}><a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ''}>${labelHtml || escapeHtml(prettyUrl(href))}</a></p>`;
}

// Video embeds: privacy-friendly players, lazy-loaded, nothing third-party until the reader scrolls there.

export function youtubeId(url: string): string | null {
  const m = url.match(
    /^https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,20})/,
  );
  return m?.[1] ?? null;
}

export function vimeoId(url: string): string | null {
  return url.match(/^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/)?.[1] ?? null;
}

function frame(src: string, title: string, caption: string): string {
  return (
    `<figure class="embed"><iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}" loading="lazy"` +
    ' referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>' +
    `${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`
  );
}

function youtubeEmbed(url: string, captionHtml: string, captionText: string): string | null {
  const id = youtubeId(url);
  return id ? frame(`https://www.youtube-nocookie.com/embed/${id}`, captionText || 'YouTube video', captionHtml) : null;
}

function videoEmbed(url: string, captionHtml: string, captionText: string): string | null {
  const youtube = youtubeEmbed(url, captionHtml, captionText);
  if (youtube) return youtube;
  const vimeo = vimeoId(url);
  return vimeo ? frame(`https://player.vimeo.com/video/${vimeo}?dnt=1`, captionText || 'Vimeo video', captionHtml) : null;
}

/**
 * A paragraph that is nothing but a pasted YouTube or Vimeo link becomes the player. A link whose
 * text is words ("watch the demo") stays a link.
 */
function soleVideoLink(rt: RichText[]): string | null {
  const [only, ...rest] = rt;
  if (!only || rest.length || !only.href) return null;
  const label = only.plain_text.trim();
  if (/\s/.test(label) || !/[./]/.test(label)) return null;
  return videoEmbed(only.href, '', '');
}
