import type { NotionClient } from './client';
import type { NotionFile } from './types';
import { compactId, constantTimeEqual, hmacSha256, safeSrc, toBase64Url } from './util';

/**
 * Images uploaded to Notion are served from signed URLs that expire after an hour, so a cached
 * page that embeds them breaks. This module serves them through a route on your own site:
 *
 *   /notion-image/<kind>/<id>[/<property>/<index>]/<version>/<signature>
 *
 * The route asks Notion for a fresh URL, streams the bytes once and lets the CDN cache them for
 * a year. `version` changes when the image is edited, so caches never go stale. The signature
 * (HMAC) means the route only serves images this site rendered: nobody can use it to read other
 * files from your workspace by guessing ids.
 */

export type NotionImageRef =
  | { kind: 'block'; id: string }
  | { kind: 'cover'; id: string }
  | { kind: 'property'; id: string; property: string; index: number };

export type ImageSource = { kind: 'external'; url: string } | { kind: 'notion'; ref: NotionImageRef; version: string };

const CONTEXT = 'publish-from-notion/image/v1';
const SIGNATURE_LENGTH = 22; // 132 bits of HMAC-SHA256, base64url

/** Short, URL-safe version string that changes whenever the source is edited. */
export function imageVersion(lastEditedTime: string | undefined): string {
  const time = Date.parse(lastEditedTime ?? '');
  return Number.isFinite(time) ? time.toString(36) : '0';
}

function refParts(ref: NotionImageRef): string[] {
  const id = compactId(ref.id);
  return ref.kind === 'property' ? ['p', id, ref.property, String(ref.index)] : [ref.kind === 'block' ? 'b' : 'c', id];
}

async function sign(parts: string[], version: string, key: string): Promise<string> {
  const digest = await hmacSha256(key, [CONTEXT, ...parts, version].join('\n'));
  return toBase64Url(digest).slice(0, SIGNATURE_LENGTH);
}

/** Signed, cacheable path for a Notion-hosted image, e.g. "/notion-image/b/<id>/<v>/<sig>". */
export async function signImagePath(ref: NotionImageRef, version: string, options: { key: string; basePath: string }): Promise<string> {
  if (!options.key) throw new Error('An image signing key is required (NOTION_IMAGE_KEY or NOTION_TOKEN).');
  const parts = refParts(ref);
  const signature = await sign(parts, version, options.key);
  return [options.basePath, ...parts.map(encodeURIComponent), version, signature].join('/');
}

/** URL to put in `src` for any image source: external URLs as they are, Notion files signed. */
export async function imageSourceUrl(source: ImageSource | null, options: { key: string; basePath: string }): Promise<string | null> {
  if (!source) return null;
  if (source.kind === 'external') return source.url;
  return signImagePath(source.ref, source.version, options);
}

/** Checks a request's path segments (after the base path, URL-decoded). Returns null if tampered. */
export async function verifyImagePath(segments: string[], key: string): Promise<{ ref: NotionImageRef; version: string } | null> {
  if (!key) return null;
  const [kind, id = '', ...rest] = segments;
  let ref: NotionImageRef;
  let tail: string[];
  if (kind === 'b' || kind === 'c') {
    ref = { kind: kind === 'b' ? 'block' : 'cover', id };
    tail = rest;
  } else if (kind === 'p') {
    const [property = '', index = '', ...after] = rest;
    if (!/^\d{1,3}$/.test(index)) return null;
    ref = { kind: 'property', id, property, index: Number(index) };
    tail = after;
  } else {
    return null;
  }
  const [version = '', signature = '', ...extra] = tail;
  if (extra.length || !/^[0-9a-f]{32}$/.test(id) || !/^[0-9a-z]{1,16}$/.test(version)) return null;
  const expected = await sign(refParts(ref), version, key);
  return constantTimeEqual(signature, expected) ? { ref, version } : null;
}

function urlOf(file: NotionFile | null | undefined): { url: string; hosted: boolean } | null {
  if (file?.type === 'file') return { url: file.file.url, hosted: true };
  if (file?.type === 'external') {
    const url = safeSrc(file.external.url);
    return url ? { url, hosted: false } : null;
  }
  return null;
}

/** Current URL of the image, asked fresh from Notion (hosted URLs are short-lived). */
export async function currentImageUrl(client: NotionClient, ref: NotionImageRef): Promise<{ url: string; hosted: boolean } | null> {
  if (ref.kind === 'block') {
    const block = await client.retrieveBlock(ref.id, { fresh: true });
    return block.type === 'image' ? urlOf(block.image as NotionFile) : null;
  }
  const page = await client.retrievePage(ref.id, { fresh: true });
  if (ref.kind === 'cover') return urlOf(page.cover);
  const property = Object.values(page.properties).find((p) => p.id === ref.property);
  const files = property?.type === 'files' ? (property.files as NotionFile[]) : [];
  return urlOf(files[ref.index]);
}

const IMAGE_HEADERS = {
  // Scripts inside an uploaded SVG must never run on your origin.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Handles an image request end to end and returns a standard Response, so it can back a route
 * handler in any framework. Pass the path segments after the base path.
 */
export async function serveNotionImage(
  segments: string[],
  options: { client: NotionClient; key: string; fetch?: typeof fetch },
): Promise<Response> {
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const unavailable = () => new Response('Image temporarily unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const verified = await verifyImagePath(segments, options.key);
  if (!verified) return notFound();

  let source: { url: string; hosted: boolean } | null;
  try {
    source = await currentImageUrl(options.client, verified.ref);
  } catch {
    return unavailable();
  }
  if (!source) return notFound();

  // Images that now live elsewhere are not proxied: the browser fetches them directly.
  if (!source.hosted) {
    return new Response(null, { status: 302, headers: { Location: source.url, 'Cache-Control': 'public, max-age=3600' } });
  }

  let upstream: Response;
  try {
    upstream = await (options.fetch ?? fetch)(source.url);
  } catch {
    return unavailable();
  }
  const type = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) return unavailable();
  const headers = new Headers({ ...IMAGE_HEADERS, 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  return new Response(upstream.body, { status: 200, headers });
}
