import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  changelogFeed,
  changelogLlmsSection,
  changelogSitemapEntry,
  loadReleaseNotes,
  queryReleases,
  releaseDigest,
  releaseName,
  releasePath,
  splitItems,
  type Release,
} from '../src/lib/notion/changelog';
import { checkReleases } from '../src/lib/notion/checks';
import { defineChangelogConfig } from '../src/lib/notion/config';
import { TAGS } from '../src/lib/notion/tags';
import { heading, mockClient, node, page, para, prop, rt, uuid } from './helpers';

const config = defineChangelogConfig({ dataSource: uuid(600), siteUrl: 'https://www.example.com', siteName: 'Example' });

function releaseRow(fields: {
  id?: string;
  name?: string;
  version?: string;
  date?: string | null;
  created?: string;
  product?: string;
  summary?: string;
  isNew?: string;
  improved?: string;
  fixed?: string;
}) {
  return page(
    {
      Name: prop.title(fields.name ?? ''),
      Version: prop.text(fields.version ?? '', 'ver'),
      'Release date': prop.date(fields.date === undefined ? '2026-09-01' : fields.date),
      Product: prop.select(fields.product ?? null),
      Summary: prop.text(fields.summary ?? '', 'sum'),
      New: prop.text(fields.isNew ?? '', 'new'),
      Improved: prop.text(fields.improved ?? '', 'imp'),
      Fixed: prop.text(fields.fixed ?? '', 'fix'),
      Published: prop.checkbox(true),
    },
    { id: fields.id, created: fields.created },
  );
}

describe('splitItems', () => {
  it('keeps one change per line and drops the list markers people type', () => {
    assert.deepEqual(splitItems('- Faster exports\r\n* Dark mode\n• Retina icons\n1. Fewer clicks\n2) Smaller app\n\n   \nPlain line'), [
      'Faster exports',
      'Dark mode',
      'Retina icons',
      'Fewer clicks',
      'Smaller app',
      'Plain line',
    ]);
  });

  it('leaves a leading number that is part of the change', () => {
    assert.deepEqual(splitItems('3 new export presets\n-5% smaller downloads'), ['3 new export presets', '-5% smaller downloads']);
  });
});

describe('queryReleases', () => {
  it('returns nothing, without calling Notion, when there is no token or no data source', async () => {
    const offline = mockClient({ rows: [releaseRow({ name: 'A' })] }, { configured: false });
    assert.deepEqual(await queryReleases(offline, config), { releases: [], skipped: [] });
    const unset = mockClient({ rows: [releaseRow({ name: 'A' })] });
    assert.deepEqual(await queryReleases(unset, defineChangelogConfig({})), { releases: [], skipped: [] });
    assert.equal(offline.calls.length + unset.calls.length, 0);
  });

  it('queries published rows with the list tag, so a webhook refreshes the changelog like the blog', async () => {
    const client = mockClient({ rows: [] });
    await queryReleases(client, config);
    assert.deepEqual(client.calls[0]?.body, { filter: { property: 'Published', checkbox: { equals: true } } });
    assert.deepEqual(client.calls[0]?.options, { tags: [TAGS.posts] });
  });

  it('maps a release, keeps only filled sections in the configured order, and sorts newest first', async () => {
    const client = mockClient({
      rows: [
        releaseRow({ name: 'First release', version: '1.0.0', date: '2026-06-01', isNew: 'Everything' }),
        releaseRow({ name: 'Faster exports', version: '2.3.0', date: '2026-09-20', product: 'Studio', summary: 'Exports twice as fast.', fixed: '- Crash on quit', isNew: 'Batch export\nPresets' }),
      ],
    });
    const { releases, skipped } = await queryReleases(client, config);
    assert.deepEqual(skipped, []);
    assert.deepEqual(releases.map((r) => r.version), ['2.3.0', '1.0.0']);
    const [latest] = releases;
    assert.equal(latest?.title, 'Faster exports');
    assert.equal(latest?.product, 'Studio');
    assert.equal(latest?.summary, 'Exports twice as fast.');
    assert.equal(latest?.dateSource, 'property');
    assert.deepEqual(latest?.sections, [
      { label: 'New', items: ['Batch export', 'Presets'] },
      { label: 'Fixed', items: ['Crash on quit'] },
    ]);
  });

  it('gives every release a unique anchor from its version, else its title', async () => {
    const client = mockClient({
      rows: [
        releaseRow({ name: 'Spring cleaning', date: '2026-09-03', fixed: 'Typos' }),
        releaseRow({ name: 'Hotfix', version: '2.3.1', date: '2026-09-02', fixed: 'Crash' }),
        releaseRow({ name: 'Hotfix again', version: '2.3.1', date: '2026-09-01', fixed: 'Other crash' }),
        releaseRow({ name: 'Content', date: '2026-08-01', fixed: 'Layout' }),
      ],
    });
    const { releases } = await queryReleases(client, config);
    assert.deepEqual(releases.map((r) => r.anchor), ['spring-cleaning', 'v2-3-1', 'v2-3-1-2', 'content-2']);
    assert.equal(releasePath(config, releases[1]!), '/changelog#v2-3-1');
  });

  it('skips rows with neither a name nor a version, and, with page bodies off, rows without notes', async () => {
    const rows = [releaseRow({ id: uuid(610) }), releaseRow({ name: 'Empty', version: '0.9.0' }), releaseRow({ name: 'Summary only', summary: 'Small fixes.' })];
    const withBodies = await queryReleases(mockClient({ rows }), config);
    assert.deepEqual(withBodies.releases.map((r) => r.title), ['Empty', 'Summary only']);
    assert.deepEqual(withBodies.skipped, [{ id: uuid(610), title: '(untitled)', reason: 'it has neither a Name nor a Version' }]);

    const withoutBodies = await queryReleases(mockClient({ rows }), defineChangelogConfig({ ...config, body: false }));
    assert.deepEqual(withoutBodies.releases.map((r) => r.title), ['Summary only']);
    const empty = withoutBodies.skipped.find((row) => row.title === '0.9.0: Empty');
    assert.match(empty?.reason ?? '', /no notes/);
    assert.equal(withoutBodies.skipped.length, 2);
  });

  it('falls back to the creation date, and keeps Notion order for releases of the same day', async () => {
    const client = mockClient({
      rows: [
        releaseRow({ name: 'Older page', date: null, created: '2026-09-05T08:00:00.000Z', fixed: 'A' }),
        releaseRow({ name: 'Morning', date: '2026-09-05', created: '2026-09-05T07:00:00.000Z', fixed: 'B' }),
        releaseRow({ name: 'Evening', date: '2026-09-05', created: '2026-09-05T19:00:00.000Z', fixed: 'C' }),
      ],
    });
    const { releases } = await queryReleases(client, config);
    assert.deepEqual(releases.map((r) => r.title), ['Older page', 'Evening', 'Morning']);
    assert.equal(releases[0]?.dateSource, 'created');
  });

  it('reads custom property names and sections, such as Keep a Changelog headings', async () => {
    const custom = defineChangelogConfig({
      dataSource: uuid(600),
      properties: { title: 'Release', version: 'Tag' },
      sections: [
        { label: 'Added', property: 'Added' },
        { label: 'Removed', property: 'Removed' },
      ],
    });
    const row = page({ Release: prop.title('Big one'), Tag: prop.text('3.0', 't'), Added: prop.text('API', 'a'), Removed: prop.text('Legacy mode', 'r'), Published: prop.checkbox(true) });
    const { releases } = await queryReleases(mockClient({ rows: [row] }), custom);
    assert.equal(releases[0]?.anchor, 'v3-0');
    assert.deepEqual(releases[0]?.sections.map((s) => s.label), ['Added', 'Removed']);
  });
});

const release = (fields: Partial<Release>): Release => ({
  id: uuid(620),
  title: 'Faster exports',
  version: '2.3.0',
  date: '2026-09-20',
  dateSource: 'property',
  updatedAt: '2026-09-21T10:00:00.000Z',
  product: '',
  summary: '',
  anchor: 'v2-3-0',
  sections: [{ label: 'New', items: ['Batch export', 'Presets'] }],
  ...fields,
});

describe('release text', () => {
  it('names a release by version and title, whichever it has', () => {
    assert.equal(releaseName(release({})), '2.3.0: Faster exports');
    assert.equal(releaseName(release({ version: '' })), 'Faster exports');
    assert.equal(releaseName(release({ title: '' })), '2.3.0');
  });

  it('digests a release as its summary, else its sections', () => {
    assert.equal(releaseDigest(release({ summary: 'Twice as fast.' })), 'Twice as fast.');
    assert.equal(releaseDigest(release({ sections: [{ label: 'New', items: ['A', 'B'] }, { label: 'Fixed', items: ['C'] }] })), 'New: A; B. Fixed: C.');
  });
});

describe('changelog outputs', () => {
  const releases = [release({ product: 'Studio & Suite', title: 'Faster <exports>' }), release({ id: uuid(621), version: '2.2.0', anchor: 'v2-2-0', date: '2026-08-01' })];

  it('builds an escaped RSS feed whose items link to each release anchor', () => {
    const feed = changelogFeed(config, releases);
    assert.match(feed, /<title>Changelog \| Example<\/title>/);
    assert.match(feed, /<link>https:\/\/www\.example\.com\/changelog#v2-3-0<\/link>/);
    assert.match(feed, /<title>2\.3\.0: Faster &lt;exports&gt;<\/title>/);
    assert.match(feed, /<category>Studio &amp; Suite<\/category>/);
    assert.match(feed, /<description>New: Batch export; Presets\.<\/description>/);
    assert.match(feed, /<atom:link href="https:\/\/www\.example\.com\/changelog\/feed\.xml" rel="self"/);
    assert.ok(!feed.includes('<exports>'));
  });

  it('lists the changelog in the sitemap, dated by the newest release, and in llms.txt', () => {
    assert.deepEqual(changelogSitemapEntry(config, releases), { url: 'https://www.example.com/changelog', lastModified: '2026-09-21T10:00:00.000Z' });
    const section = changelogLlmsSection(config, releases, 1);
    assert.equal(section.title, 'Changelog');
    assert.deepEqual(section.links, [{ title: '2.3.0: Faster <exports>', url: 'https://www.example.com/changelog#v2-3-0', description: 'New: Batch export; Presets.' }]);
  });
});

describe('loadReleaseNotes', () => {
  it('renders the page one level below the release heading, with unique ids and signed images', async () => {
    const id = uuid(630);
    const image = node('image', { type: 'file', file: { url: 'https://files.example/shot.png' }, caption: [rt('Screenshot')] });
    const client = mockClient({ trees: { [id]: [heading(1, 'Details'), para(rt('Longer notes.')), image] } });
    const notes = await loadReleaseNotes(client, config, release({ id }), { imageKey: 'k'.repeat(32), usedIds: ['details'] });
    assert.match(notes.html, /<h3 id="details-2">Details<\/h3>/);
    assert.deepEqual(notes.headingIds, ['details-2']);
    assert.match(notes.html, /src="\/notion-image\/b\//);
    assert.match(notes.text, /Longer notes\./);
    assert.deepEqual(client.calls[0]?.options, { tags: [TAGS.page(id)] });
  });
});

describe('checkReleases', () => {
  it('errors on skipped rows and draft markers, warns on missing dates and unsupported blocks', () => {
    const issues = checkReleases(
      {
        releases: [release({ dateSource: 'created', sections: [{ label: 'New', items: ['Export [TODO: name]'] }] })],
        skipped: [{ id: uuid(640), title: '(untitled)', reason: 'it has neither a Name nor a Version' }],
        notes: new Map([[uuid(620), { html: '<p>ok</p>', text: 'ok', headingIds: [], unsupported: ['pdf uploaded to Notion'] }]]),
        collection: 'changelog',
      },
    );
    assert.deepEqual(
      issues.map((i) => [i.level, i.post, i.collection]),
      [
        ['error', '(untitled)', 'changelog'],
        ['warning', '2.3.0: Faster exports', 'changelog'],
        ['error', '2.3.0: Faster exports', 'changelog'],
        ['warning', '2.3.0: Faster exports', 'changelog'],
      ],
    );
    assert.match(issues[2]?.message ?? '', /\[TODO/);
  });

  it('leaves the collection off issues when none is given', () => {
    const [issue] = checkReleases({ releases: [], skipped: [{ id: uuid(641), title: 'X', reason: 'r' }] });
    assert.deepEqual(Object.keys(issue ?? {}).sort(), ['level', 'message', 'post']);
  });
});
