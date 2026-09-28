/** Small, dependency-free helpers shared by the kit. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL-safe slug that keeps letters from every script ("crème brûlée" → "creme-brulee",
 * "日本語の記事" stays readable). Accents are only stripped from Latin letters, so scripts
 * that rely on combining marks are left intact.
 */
export function slugify(value: string, fallback = ''): string {
  const slug = value
    .normalize('NFD')
    .replace(/([A-Za-z])\p{Mn}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const capped = Array.from(slug).slice(0, 96).join('').replace(/-+$/, '');
  return capped || fallback;
}

const NOTION_ID = /([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})/gi;

/**
 * Canonical dashed id from anything a person might paste: a bare id with or without dashes,
 * or a full Notion URL. In a URL the id is the last one in the path, so the `?v=` view id of a
 * database link is ignored.
 */
export function normalizeNotionId(input: string): string | null {
  const path = input.trim().split(/[?#]/)[0] ?? '';
  const match = [...path.matchAll(NOTION_ID)].at(-1);
  if (!match) return null;
  return match.slice(1, 6).join('-').toLowerCase();
}

/** Id without dashes: the stable form used in cache tags and lookups. */
export function compactId(id: string): string {
  return (normalizeNotionId(id) ?? id).replace(/-/g, '');
}

/**
 * Link target that is safe to put in an href: http(s), mailto and tel URLs, site-relative paths
 * and fragments. Everything else (javascript:, data:, protocol-relative //host) returns null.
 */
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (value.startsWith('#')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Image or media source that is safe to put in a src: http(s) URLs and site-relative paths. */
export function safeSrc(src: string): string | null {
  const value = src.trim();
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** "https://www.example.com/a/b?c" → "example.com/a/b", for link labels. */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const text = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  } catch {
    return url;
  }
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/** Reading time at 200 words a minute, counting CJK text by characters (about 400 a minute). */
export function readingMinutes(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200 + cjk / 400));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Crypto on the Web Crypto API, so the same code runs on Node, edge runtimes and workers.

const encoder = new TextEncoder();

export async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time comparison of two strings of the same length (signatures, digests). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compares a provided secret with the expected one without leaking either its content or its
 * length through timing: both sides are hashed first, then compared in constant time.
 */
export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const digest = async (value: string) =>
    toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  return constantTimeEqual(a, b);
}
