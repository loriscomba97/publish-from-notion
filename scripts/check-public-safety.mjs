#!/usr/bin/env node
/**
 * Public-safety scan. Runs before every commit and push, and in CI.
 *
 * This repository is public: whatever lands in it, including history and commit messages,
 * is published for good. The scan fails when it finds:
 *   - credentials (Notion, Stripe, GitHub, AWS, Google, Slack tokens, JWTs, private keys);
 *   - files that must never be committed (.env files, keys, service-account JSON);
 *   - email addresses other than example.* and GitHub noreply ones in files;
 *   - with --identities: commit author or committer emails that are not GitHub noreply, and any
 *     email address in commit messages;
 *   - terms from the maintainer's private denylist (names, internal ids, domains). The
 *     denylist lives OUTSIDE the repository, so the list itself is never published.
 *
 * Usage:
 *   node scripts/check-public-safety.mjs              working tree (tracked + untracked, not ignored)
 *   node scripts/check-public-safety.mjs --history    every blob, path and commit message in every ref
 *   --unpushed                                        with --history: only what no remote has yet
 *   --identities                                      with --history: commit identities too (maintainer hooks)
 *   --require-denylist                                fail when the private denylist is missing (maintainer hooks)
 *
 * CI runs --history without --identities: contributors commit with whatever email they like,
 * and the maintainer's own identity is checked by the hooks before anything leaves their machine.
 *
 * Private denylist: the path in $PUBLIC_SAFETY_DENYLIST, else "<repo-folder>.denylist.txt" next to
 * the repository folder. One case-insensitive literal per line, "re:<regex>" for a pattern, and an
 * optional " @allow=path1,path2" suffix that permits the term in those files only. Lines starting
 * with "#" are comments.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const args = new Set(process.argv.slice(2));
const HISTORY = args.has('--history');
const REQUIRE_DENYLIST = args.has('--require-denylist');
const UNPUSHED = args.has('--unpushed');
const IDENTITIES = args.has('--identities');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const root = git('rev-parse', '--show-toplevel').trim();

const SECRET_RULES = [
  ['Notion token', /\b(?:secret_[A-Za-z0-9]{43}|ntn_[A-Za-z0-9]{40,})\b/],
  ['Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{10,}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL =
  /(?:@example\.(?:com|org|net)|@users\.noreply\.github\.com|^noreply@github\.com)$/i;
const IDENTITY_EMAIL = /(?:@users\.noreply\.github\.com|^noreply@github\.com)$/i;
const FORBIDDEN_FILE =
  /(?:^|\/)(?:\.env(?!\.example$)[^/]*|[^/]*\.(?:pem|key|p12|pfx)|id_(?:rsa|ecdsa|ed25519)[^/]*|[^/]*service[-_]?account[^/]*\.json)$/i;

const findings = [];
const report = (where, line, rule, detail = '') =>
  findings.push(`${where}${line ? `:${line}` : ''}  ${rule}${detail ? `  ${detail}` : ''}`);
const mask = (s) => `${s.slice(0, 4)}… (${s.length} chars)`;
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function loadDenylist() {
  const path = process.env.PUBLIC_SAFETY_DENYLIST || join(dirname(root), `${basename(root)}.denylist.txt`);
  if (!existsSync(path)) return null;
  const rules = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(.*?)\s+@allow=(\S+)$/);
    const term = (m ? m[1] : line).trim();
    const allow = m ? m[2].split(',') : [];
    const re = term.startsWith('re:') ? new RegExp(term.slice(3), 'i') : new RegExp(escapeRe(term), 'i');
    rules.push({ label: `private denylist "${term}"`, re, allow });
  }
  return rules;
}

const deny = loadDenylist();
if (!deny) {
  const msg = 'private denylist not found (see the header of this script)';
  if (REQUIRE_DENYLIST) {
    console.error(`check-public-safety: ${msg}; refusing to continue.`);
    process.exit(1);
  }
  console.warn(`check-public-safety: ${msg}; running the generic checks only.`);
}

function scanText(text, where, file, { emails = true } = {}) {
  text.split('\n').forEach((line, i) => {
    for (const [label, re] of SECRET_RULES) {
      const m = line.match(re);
      if (m) report(where, i + 1, label, mask(m[0]));
    }
    for (const e of emails ? (line.match(EMAIL) ?? []) : []) {
      if (!ALLOWED_EMAIL.test(e)) report(where, i + 1, 'email address', mask(e));
    }
    for (const r of deny ?? []) {
      if (!r.allow.includes(file) && r.re.test(line)) report(where, i + 1, r.label);
    }
  });
}

if (HISTORY) {
  // Every ref, or with --unpushed only what no remote-tracking ref already has: commits merged on
  // the remote (a contributor's pull request, say) are public already and never block a push.
  const refs = UNPUSHED ? ['--all', '--not', '--remotes'] : ['--all'];
  // Every blob reachable from those refs, with the first path it was seen at.
  const pathOf = new Map();
  for (const l of git('rev-list', '--objects', ...refs).split('\n')) {
    const [sha, ...p] = l.split(' ');
    if (sha && p.length && !pathOf.has(sha)) pathOf.set(sha, p.join(' '));
  }
  const types = pathOf.size
    ? execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
        cwd: root,
        input: `${[...pathOf.keys()].join('\n')}\n`,
        encoding: 'utf8',
      })
    : '';
  for (const l of types.split('\n')) {
    const [sha, type] = l.split(' ');
    if (type !== 'blob') continue;
    const file = pathOf.get(sha);
    if (FORBIDDEN_FILE.test(file)) report(`${file} (history)`, 0, 'file that must never be committed');
    const buf = execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, maxBuffer: 1 << 28 });
    if (!isBinary(buf)) scanText(buf.toString('utf8'), `${file} (history ${sha.slice(0, 7)})`, file);
  }
  const hasCommits = git('rev-list', ...refs, '--max-count=1').trim() !== '';
  if (hasCommits) {
    if (IDENTITIES) {
      for (const e of new Set(git('log', ...refs, '--format=%ae%n%ce').split('\n').filter(Boolean))) {
        if (!IDENTITY_EMAIL.test(e)) report('commit identity', 0, 'author/committer email is not GitHub noreply', mask(e));
      }
    }
    for (const entry of git('log', ...refs, '--format=%h%x00%B%x01').split('\x01')) {
      const [sha, body] = entry.replace(/^\n/, '').split('\0');
      if (sha && body) scanText(body, `commit message ${sha}`, '', { emails: IDENTITIES });
    }
  }
} else {
  const files = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
  for (const f of files) {
    if (FORBIDDEN_FILE.test(f)) report(f, 0, 'file that must never be committed');
    const abs = join(root, f);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    if (!isBinary(buf)) scanText(buf.toString('utf8'), f, f);
  }
}

if (findings.length) {
  console.error(`check-public-safety: ${findings.length} finding(s). Nothing may be committed or pushed until they are fixed.`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check-public-safety: clean (${HISTORY ? 'history' : 'working tree'}${deny ? ', private denylist applied' : ''}).`);
