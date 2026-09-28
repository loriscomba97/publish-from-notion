/**
 * Synthetic Notion objects for tests. Every id and value here is made up: no fixture is copied
 * from a real workspace.
 */
import type { BlockNode } from '../src/lib/notion/blocks';
import type { CallOptions, NotionClient, QueryBody } from '../src/lib/notion/client';
import type { NotionBlock, NotionFile, NotionPage, PropertyValue, RichText } from '../src/lib/notion/types';
import { compactId } from '../src/lib/notion/util';

let counter = 0;
/** Deterministic fake UUID. */
export const uuid = (n?: number) => `00000000-0000-4000-8000-${String(n ?? ++counter).padStart(12, '0')}`;

type Marks = { bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean; underline?: boolean; href?: string };

export function rt(text: string, marks: Marks = {}): RichText {
  const { href, ...annotations } = marks;
  return { type: 'text', plain_text: text, href: href ?? null, annotations };
}

export function pageMention(text: string, pageId: string): RichText {
  return { type: 'mention', plain_text: text, href: `https://www.notion.so/${compactId(pageId)}`, mention: { type: 'page', page: { id: pageId } } };
}

export function node(type: string, data: Record<string, unknown>, options: { id?: string; children?: BlockNode[]; edited?: string } = {}): BlockNode {
  const children = options.children ?? [];
  const block = {
    object: 'block',
    id: options.id ?? uuid(),
    type,
    has_children: children.length > 0,
    last_edited_time: options.edited ?? '2026-09-01T10:00:00.000Z',
    [type]: data,
  } as NotionBlock;
  return { block, children };
}

export const para = (...items: RichText[]) => node('paragraph', { rich_text: items });
export const heading = (level: 1 | 2 | 3, text: string, options: { toggleable?: boolean; children?: BlockNode[] } = {}) =>
  node(`heading_${level}`, { rich_text: [rt(text)], is_toggleable: options.toggleable ?? false }, { children: options.children });
export const bullet = (text: string, children: BlockNode[] = []) => node('bulleted_list_item', { rich_text: [rt(text)] }, { children });
export const numbered = (text: string) => node('numbered_list_item', { rich_text: [rt(text)] });
export const toggle = (text: string, children: BlockNode[]) => node('toggle', { rich_text: [rt(text)] }, { children });

export const prop = {
  title: (text: string): PropertyValue => ({ id: 'title', type: 'title', title: text ? [rt(text)] : [] }),
  text: (text: string, id = 'txt'): PropertyValue => ({ id, type: 'rich_text', rich_text: text ? [rt(text)] : [] }),
  checkbox: (value: boolean, id = 'chk'): PropertyValue => ({ id, type: 'checkbox', checkbox: value }),
  date: (start: string | null, id = 'dat'): PropertyValue => ({ id, type: 'date', date: start ? { start, end: null } : null }),
  select: (name: string | null, id = 'sel'): PropertyValue => ({ id, type: 'select', select: name ? { name } : null }),
  status: (name: string | null, id = 'sta'): PropertyValue => ({ id, type: 'status', status: name ? { name } : null }),
  multi: (names: string[], id = 'mul'): PropertyValue => ({ id, type: 'multi_select', multi_select: names.map((name) => ({ name })) }),
  url: (url: string | null, id = 'url'): PropertyValue => ({ id, type: 'url', url }),
  files: (files: NotionFile[], id = 'fil'): PropertyValue => ({ id, type: 'files', files }),
  people: (names: string[], id = 'ppl'): PropertyValue => ({ id, type: 'people', people: names.map((name, i) => ({ object: 'user', id: uuid(900 + i), name })) }),
};

export function page(
  properties: Record<string, PropertyValue>,
  options: { id?: string; created?: string; edited?: string; cover?: NotionFile | null } = {},
): NotionPage {
  return {
    object: 'page',
    id: options.id ?? uuid(),
    created_time: options.created ?? '2026-01-01T09:00:00.000Z',
    last_edited_time: options.edited ?? '2026-09-01T10:00:00.000Z',
    cover: options.cover ?? null,
    parent: { type: 'data_source_id', data_source_id: uuid(999) },
    properties,
  };
}

/** A post row using the default property names. */
export function postRow(fields: {
  id?: string;
  title?: string;
  slug?: string;
  date?: string | null;
  excerpt?: string;
  category?: string;
  tags?: string[];
  author?: string[];
  cover?: PropertyValue;
  coverAlt?: string;
  ai?: boolean;
  pageCover?: NotionFile | null;
}): NotionPage {
  return page(
    {
      Name: prop.title(fields.title ?? 'A post'),
      Slug: prop.text(fields.slug ?? 'a-post', 'slg'),
      Published: prop.checkbox(true),
      'Published date': prop.date(fields.date === undefined ? '2026-09-01' : fields.date),
      Excerpt: prop.text(fields.excerpt ?? '', 'exc'),
      Category: prop.select(fields.category ?? null),
      Tags: prop.multi(fields.tags ?? []),
      Author: prop.people(fields.author ?? []),
      ...(fields.cover ? { Cover: fields.cover } : {}),
      'Cover alt': prop.text(fields.coverAlt ?? '', 'alt'),
      'AI image': prop.checkbox(fields.ai ?? false, 'ai'),
    },
    { id: fields.id, cover: fields.pageCover ?? null },
  );
}

/** Flattens a block tree into the children lists the API would return per parent id. */
function indexTree(parentId: string, nodes: BlockNode[], into: Map<string, NotionBlock[]>) {
  into.set(compactId(parentId), nodes.map((n) => n.block));
  for (const n of nodes) if (n.children.length) indexTree(n.block.id, n.children, into);
}

export type RecordedCall = { method: string; id: string; body?: QueryBody; options?: CallOptions };

/** In-memory NotionClient. */
export function mockClient(
  data: { rows?: NotionPage[]; trees?: Record<string, BlockNode[]>; pages?: NotionPage[]; blocks?: NotionBlock[] } = {},
  options: { configured?: boolean } = {},
): NotionClient & { calls: RecordedCall[] } {
  const children = new Map<string, NotionBlock[]>();
  for (const [pageId, nodes] of Object.entries(data.trees ?? {})) indexTree(pageId, nodes, children);
  const calls: RecordedCall[] = [];
  const find = <T extends { id: string }>(items: T[] | undefined, id: string) => items?.find((x) => compactId(x.id) === compactId(id));
  return {
    configured: options.configured ?? true,
    calls,
    async queryDataSource(id, body, callOptions) {
      calls.push({ method: 'query', id, body, options: callOptions });
      return data.rows ?? [];
    },
    async listBlockChildren(id, callOptions) {
      calls.push({ method: 'children', id, options: callOptions });
      return children.get(compactId(id)) ?? [];
    },
    async retrievePage(id, callOptions) {
      calls.push({ method: 'page', id, options: callOptions });
      const found = find(data.pages, id);
      if (!found) throw new Error(`no page ${id}`);
      return found;
    },
    async retrieveBlock(id, callOptions) {
      calls.push({ method: 'block', id, options: callOptions });
      const found = find(data.blocks, id);
      if (!found) throw new Error(`no block ${id}`);
      return found;
    },
  };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

type Step = Response | Error | ((url: string, init: RequestInit) => Response | Promise<Response>);

/** fetch that answers from a script of responses, recording every request. */
export function scriptedFetch(steps: Step[]) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    requests.push({ url, init });
    const step = steps.shift();
    if (!step) throw new Error(`unexpected request ${url}`);
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(url, init) : step;
  };
  return { fetch: fetchImpl as typeof fetch, requests };
}
