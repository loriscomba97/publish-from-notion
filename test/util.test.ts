import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactId,
  constantTimeEqual,
  escapeHtml,
  normalizeNotionId,
  prettyUrl,
  readingMinutes,
  safeHref,
  safeSrc,
  secretsMatch,
  slugify,
} from '../src/lib/notion/util';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('slugify', () => {
  it('lowercases, strips Latin accents and joins words with hyphens', () => {
    assert.equal(slugify('  Crème Brûlée: the 10 best!  '), 'creme-brulee-the-10-best');
  });
  it('keeps letters from other scripts', () => {
    assert.equal(slugify('日本語の記事 2026'), '日本語の記事-2026');
    assert.equal(slugify('Привет мир'), 'привет-мир');
  });
  it('drops emoji and punctuation, and falls back when nothing is left', () => {
    assert.equal(slugify('🚀 Launch!!!'), 'launch');
    assert.equal(slugify('!!!', 'section'), 'section');
  });
  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'word '.repeat(40)}end`);
    assert.ok(Array.from(slug).length <= 96);
    assert.ok(!slug.endsWith('-'));
  });
});

describe('normalizeNotionId', () => {
  const dashed = '1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9';
  it('accepts dashed and undashed ids', () => {
    assert.equal(normalizeNotionId(dashed), dashed);
    assert.equal(normalizeNotionId(dashed.replace(/-/g, '').toUpperCase()), dashed);
  });
  it('reads the database id from a pasted URL and ignores the view id', () => {
    const url = 'https://www.notion.so/acme/My-Blog-1a2b3c4d5e6f40718293a4b5c6d7e8f9?v=00112233445566778899aabbccddeeff';
    assert.equal(normalizeNotionId(url), dashed);
  });
  it('returns null for anything else', () => {
    assert.equal(normalizeNotionId('not-an-id'), null);
    assert.equal(normalizeNotionId(''), null);
  });
  it('compactId strips dashes', () => {
    assert.equal(compactId(dashed), '1a2b3c4d5e6f40718293a4b5c6d7e8f9');
  });
});

describe('safeHref and safeSrc', () => {
  it('keeps web, mail and phone links, relative paths and fragments', () => {
    assert.equal(safeHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    assert.equal(safeHref('mailto:hello@example.com'), 'mailto:hello@example.com');
    assert.equal(safeHref('tel:+15550100'), 'tel:+15550100');
    assert.equal(safeHref('/pricing'), '/pricing');
    assert.equal(safeHref('#faq'), '#faq');
  });
  it('rejects script and data URLs, however they are written', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:x', '//evil.example.com']) {
      assert.equal(safeHref(bad), null, bad);
    }
  });
  it('only allows http(s) and relative sources for media', () => {
    assert.equal(safeSrc('https://cdn.example.com/a.webp'), 'https://cdn.example.com/a.webp');
    assert.equal(safeSrc('/assets/a.webp'), '/assets/a.webp');
    assert.equal(safeSrc('mailto:x@example.com'), null);
    assert.equal(safeSrc('javascript:alert(1)'), null);
  });
});

describe('prettyUrl', () => {
  it('shows host and path without the protocol or www', () => {
    assert.equal(prettyUrl('https://www.example.com/docs/start?x=1'), 'example.com/docs/start');
    assert.equal(prettyUrl('https://example.com/'), 'example.com');
  });
});

describe('readingMinutes', () => {
  it('counts 200 words a minute, with a floor of one', () => {
    assert.equal(readingMinutes('word '.repeat(400)), 2);
    assert.equal(readingMinutes('short'), 1);
  });
  it('counts CJK text by characters', () => {
    assert.equal(readingMinutes('字'.repeat(800)), 2);
  });
});

describe('secret comparison', () => {
  it('matches equal secrets and rejects different or empty ones', async () => {
    assert.equal(await secretsMatch('s3cret-value', 's3cret-value'), true);
    assert.equal(await secretsMatch('s3cret-value', 's3cret-valuE'), false);
    assert.equal(await secretsMatch('', ''), false);
    assert.equal(await secretsMatch('x', ''), false);
  });
  it('constantTimeEqual rejects different lengths', () => {
    assert.equal(constantTimeEqual('abc', 'abcd'), false);
    assert.equal(constantTimeEqual('abc', 'abc'), true);
  });
});
