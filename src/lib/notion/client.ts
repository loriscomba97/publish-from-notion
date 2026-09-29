import type { NotionBlock, NotionList, NotionPage } from './types';
import { normalizeNotionId } from './util';

/**
 * Minimal client for the official Notion API, built on fetch alone (no SDK).
 *
 * - Retries 429, 5xx and network errors, honouring Retry-After, with jittered backoff.
 * - Caps concurrent requests. This is not a per-second rate limiter; 429 responses are retried.
 * - Throws on real failures instead of returning partial data: a post must never be published
 *   with half its body. In Next.js a failed revalidation keeps serving the previous version.
 * - Accepts a data source id, a database id or a pasted database URL.
 */

export const NOTION_API_URL = 'https://api.notion.com/v1';
export const NOTION_API_VERSION = '2025-09-03';

export type CallOptions = {
  /** Cache tags for this request (see TAGS). */
  tags?: string[];
  /** Must not be served from a cache, e.g. short-lived file URLs. */
  fresh?: boolean;
};

export type RequestContext = { method: 'GET' | 'POST'; path: string; tags: string[]; fresh: boolean };

export type NotionClientOptions = {
  /** API token of an internal connection. Server-side only, never expose it to the browser. */
  token: string | undefined;
  /** Extra fetch options per request, e.g. Next.js caching `{ next: { revalidate, tags } }`. */
  requestInit?: (request: RequestContext) => RequestInit;
  fetch?: typeof fetch;
  /** API root, for tests against a local mock. Default https://api.notion.com/v1. */
  baseUrl?: string;
  /** Retries on 429, 5xx and network errors. Default 5. */
  maxRetries?: number;
  /** Requests in flight at once. Default 3. */
  concurrency?: number;
  /** Receives retry notices and warnings. Default console.warn. */
  log?: (message: string) => void;
  /** Replaceable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type QueryBody = { filter?: unknown; sorts?: unknown[] };

export type NotionClient = {
  /** True when a token is set. Without one, callers should render an empty state. */
  readonly configured: boolean;
  queryDataSource(idOrUrl: string, body?: QueryBody, options?: CallOptions): Promise<NotionPage[]>;
  listBlockChildren(blockId: string, options?: CallOptions): Promise<NotionBlock[]>;
  retrievePage(pageId: string, options?: CallOptions): Promise<NotionPage>;
  retrieveBlock(blockId: string, options?: CallOptions): Promise<NotionBlock>;
};

export class NotionApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'NotionApiError';
    this.status = status;
    this.code = code;
  }
}

const SHARE_HINT =
  'Make sure the database is shared with your connection: in Notion, "..." menu > Connections > Add connection, or its Content access tab in the Developer portal.';

async function toApiError(res: Response, method: string, path: string): Promise<NotionApiError> {
  let code = 'http_error';
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    code = body.code ?? code;
    detail = body.message ?? detail;
  } catch {
    // Not JSON: keep the status text.
  }
  const hint =
    res.status === 401
      ? ' Check NOTION_TOKEN.'
      : res.status === 404 || res.status === 403
        ? ` ${SHARE_HINT}`
        : '';
  return new NotionApiError(`Notion ${res.status} ${code} on ${method} ${path}: ${detail}.${hint}`, res.status, code);
}

function retryDelay(res: Response | undefined, attempt: number): number {
  const seconds = Number(res?.headers.get('retry-after') ?? Number.NaN);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 60) * 1000;
  const base = Math.min(8000, 500 * 2 ** attempt);
  return Math.round(base / 2 + Math.random() * (base / 2));
}

/** Runs at most `max` tasks at once; a finished task hands its slot straight to the next one. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

export function createNotionClient(options: NotionClientOptions): NotionClient {
  const { token } = options;
  // Look fetch up on every call, never once at import: frameworks such as Next.js install their
  // caching fetch after modules load, and a captured reference would silently bypass it.
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const baseUrl = (options.baseUrl || NOTION_API_URL).replace(/\/+$/, '');
  const maxRetries = options.maxRetries ?? 5;
  const log = options.log ?? ((message: string) => console.warn(`[notion] ${message}`));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const limit = createLimiter(options.concurrency ?? 3);
  const dataSourceOf = new Map<string, string>();

  async function call<T>(method: 'GET' | 'POST', path: string, body: unknown, callOptions: CallOptions): Promise<T> {
    if (!token) throw new NotionApiError('NOTION_TOKEN is not set.', 0, 'not_configured');
    const extra = options.requestInit?.({ method, path, tags: callOptions.tags ?? [], fresh: callOptions.fresh ?? false }) ?? {};
    const headers = new Headers(extra.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Notion-Version', NOTION_API_VERSION);
    if (body !== undefined) headers.set('Content-Type', 'application/json');

    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      let networkError: unknown;
      try {
        res = await limit(() =>
          doFetch(`${baseUrl}${path}`, {
            ...extra,
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        );
      } catch (error) {
        networkError = error;
      }
      if (res?.ok) return (await res.json()) as T;

      const retryable = res === undefined || res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        if (res) throw await toApiError(res, method, path);
        throw new NotionApiError(`Network error on ${method} ${path}: ${String(networkError)}`, 0, 'network_error');
      }
      const wait = retryDelay(res, attempt);
      log(`${res ? `HTTP ${res.status}` : 'network error'} on ${method} ${path}, retry ${attempt + 1}/${maxRetries} in ${wait} ms`);
      await sleep(wait);
    }
  }

  async function paginate<T>(load: (cursor: string | undefined) => Promise<NotionList<T>>): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await load(cursor);
      results.push(...page.results);
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }

  function query(dataSourceId: string, body: QueryBody, callOptions: CallOptions) {
    return paginate<NotionPage>((cursor) =>
      call('POST', `/data_sources/${dataSourceId}/query`, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }, callOptions),
    );
  }

  function requireId(input: string): string {
    const id = normalizeNotionId(input);
    if (!id) throw new NotionApiError(`"${input}" is not a Notion id or URL.`, 0, 'invalid_id');
    return id;
  }

  return {
    configured: Boolean(token),

    async queryDataSource(idOrUrl, body = {}, callOptions = {}) {
      const id = requireId(idOrUrl);
      const known = dataSourceOf.get(id);
      if (known) return query(known, body, callOptions);
      try {
        return await query(id, body, callOptions);
      } catch (error) {
        // A database id (what the database URL shows) is not a data source id since API 2025-09-03.
        // Resolve it once through the database, then query its data source.
        if (!(error instanceof NotionApiError) || (error.status !== 404 && error.status !== 400)) throw error;
        const database = await call<{ data_sources?: Array<{ id: string; name?: string }> }>(
          'GET',
          `/databases/${id}`,
          undefined,
          callOptions,
        ).catch(() => null);
        const sources = database?.data_sources ?? [];
        const first = sources[0];
        if (!first) throw error;
        if (sources.length > 1) {
          log(`database ${id} has ${sources.length} data sources; using the first ("${first.name ?? first.id}"). Configure a data source id to pick another.`);
        }
        dataSourceOf.set(id, first.id);
        return query(first.id, body, callOptions);
      }
    },

    listBlockChildren(blockId, callOptions = {}) {
      const id = requireId(blockId);
      return paginate<NotionBlock>((cursor) =>
        call('GET', `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, callOptions),
      );
    },

    retrievePage(pageId, callOptions = {}) {
      return call('GET', `/pages/${requireId(pageId)}`, undefined, callOptions);
    },

    retrieveBlock(blockId, callOptions = {}) {
      return call('GET', `/blocks/${requireId(blockId)}`, undefined, callOptions);
    },
  };
}
