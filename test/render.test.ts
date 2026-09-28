import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BlockNode } from '../src/lib/notion/blocks';
import { renderBlocks, type RenderOptions } from '../src/lib/notion/render';
import { compactId } from '../src/lib/notion/util';
import { bullet, heading, node, numbered, pageMention, para, rt, toggle, uuid } from './helpers';

const html = (nodes: BlockNode[], options?: RenderOptions) => renderBlocks(nodes, options).html;
const post = uuid(700);
const resolvePage = (id: string) => (compactId(id) === compactId(post) ? { href: '/blog/other-post', title: 'Other post' } : null);

describe('text and links', () => {
  it('escapes text, so markup typed in Notion is shown, never executed', () => {
    assert.equal(html([para(rt('<script>alert("x")</script> & more'))]), '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more</p>');
  });

  it('applies annotations and turns soft line breaks into <br>', () => {
    assert.equal(
      html([para(rt('bold', { bold: true }), rt(' '), rt('code', { code: true, italic: true }), rt('\nnext line'))]),
      '<p><strong>bold</strong> <em><code>code</code></em><br>next line</p>',
    );
  });

  it('keeps safe links and marks external ones rel="noopener"', () => {
    assert.equal(
      html([para(rt('site', { href: 'https://example.com' }), rt(' and '), rt('pricing', { href: '/pricing' }))]),
      '<p><a href="https://example.com/" rel="noopener">site</a> and <a href="/pricing">pricing</a></p>',
    );
  });

  it('drops dangerous links but keeps their text', () => {
    assert.equal(html([para(rt('click me', { href: 'javascript:alert(document.cookie)' }))]), '<p>click me</p>');
    assert.equal(html([para(rt('data', { href: 'data:text/html,<script>alert(1)</script>' }))]), '<p>data</p>');
  });

  it('rewrites links to other posts and drops links to private workspace pages', () => {
    const toPost = `/${compactId(post)}`;
    const toPrivate = `/${compactId(uuid(701))}`;
    assert.equal(
      html(
        [para(rt('a post', { href: toPost }), rt(' / '), rt('a private page', { href: toPrivate }), rt(' / '), pageMention('Other post', post))],
        { resolvePage },
      ),
      '<p><a href="/blog/other-post">a post</a> / a private page / <a href="/blog/other-post">Other post</a></p>',
    );
  });

  it('drops notion.so links that are not posts, keeps public notion.site pages', () => {
    assert.equal(
      html([para(rt('workspace', { href: `https://www.notion.so/acme/Plan-${compactId(uuid(702))}` }), rt(' '), rt('public', { href: 'https://acme.notion.site/Roadmap' }))], {
        resolvePage,
      }),
      '<p>workspace <a href="https://acme.notion.site/Roadmap" rel="noopener">public</a></p>',
    );
  });

  it('never links user mentions', () => {
    const mention = { type: 'mention' as const, plain_text: '@Ada', href: null, mention: { type: 'user', user: { id: uuid(), name: 'Ada' } } };
    assert.equal(html([para(mention)]), '<p>@Ada</p>');
  });
});

describe('headings', () => {
  it('shifts levels down so the page title stays the only h1, with unique ids', () => {
    const result = renderBlocks([heading(1, 'Intro'), heading(2, 'Details'), heading(3, 'Deep dive'), heading(1, 'Intro')]);
    assert.equal(result.html, '<h2 id="intro">Intro</h2>\n<h3 id="details">Details</h3>\n<h4 id="deep-dive">Deep dive</h4>\n<h2 id="intro-2">Intro</h2>');
    assert.deepEqual(result.headings.map((h) => [h.id, h.level]), [['intro', 2], ['details', 3], ['deep-dive', 4], ['intro-2', 2]]);
  });

  it('never reuses ids of the page layout', () => {
    assert.equal(html([heading(1, 'Main')]), '<h2 id="main-2">Main</h2>');
  });

  it('renders toggle headings as disclosure widgets and skips empty headings', () => {
    assert.equal(
      html([heading(2, 'More', { toggleable: true, children: [para(rt('Hidden'))] }), heading(1, '  ')]),
      '<details><summary><h3 id="more">More</h3></summary><p>Hidden</p></details>',
    );
  });

  it('builds a table of contents from every heading, including later ones', () => {
    const out = html([node('table_of_contents', {}), heading(1, 'One'), heading(2, 'Two')]);
    assert.equal(
      out.split('\n')[0],
      '<nav class="toc" aria-label="Contents"><ol><li class="toc-level-1"><a href="#one">One</a></li><li class="toc-level-2"><a href="#two">Two</a></li></ol></nav>',
    );
  });
});

describe('lists and containers', () => {
  it('groups consecutive items, nests children and starts a new list when the type changes', () => {
    assert.equal(
      html([bullet('a', [bullet('a.1')]), bullet('b'), numbered('one'), numbered('two'), para(rt('after'))]),
      '<ul><li>a<ul><li>a.1</li></ul></li><li>b</li></ul>\n<ol><li>one</li><li>two</li></ol>\n<p>after</p>',
    );
  });

  it('renders to-dos as a task list', () => {
    assert.equal(
      html([node('to_do', { rich_text: [rt('done')], checked: true }), node('to_do', { rich_text: [rt('open')], checked: false })]),
      '<ul class="todo-list"><li class="todo"><input type="checkbox" disabled checked> done</li><li class="todo"><input type="checkbox" disabled> open</li></ul>',
    );
  });

  it('renders toggles, quotes and callouts with their children', () => {
    assert.equal(html([toggle('Why?', [para(rt('Because.'))])]), '<details><summary>Why?</summary><p>Because.</p></details>');
    assert.equal(html([node('quote', { rich_text: [rt('Quoted')] })]), '<blockquote><p>Quoted</p></blockquote>');
    assert.equal(
      html([node('callout', { rich_text: [rt('Heads up')], icon: { type: 'emoji', emoji: '💡' } }, { children: [para(rt('More'))] })]),
      '<div class="callout" role="note"><span class="callout-icon" aria-hidden="true">💡</span><div class="callout-body"><p>Heads up</p><p>More</p></div></div>',
    );
  });

  it('renders columns and synced blocks by their content', () => {
    const columns = node('column_list', {}, { children: [node('column', {}, { children: [para(rt('left'))] }), node('column', {}, { children: [para(rt('right'))] })] });
    assert.equal(html([columns]), '<div class="columns"><div class="column"><p>left</p></div><div class="column"><p>right</p></div></div>');
    assert.equal(html([node('synced_block', { synced_from: null }, { children: [para(rt('shared'))] })]), '<p>shared</p>');
  });

  it('renders tables with column and row headers', () => {
    const row = (...cells: string[]) => node('table_row', { cells: cells.map((c) => [rt(c)]) });
    const table = node('table', { has_column_header: true, has_row_header: true, table_width: 2 }, { children: [row('Plan', 'Price'), row('Free', '0')] });
    assert.equal(
      html([table]),
      '<div class="table-wrap"><table><thead><tr><th scope="col">Plan</th><th scope="col">Price</th></tr></thead><tbody><tr><th scope="row">Free</th><td>0</td></tr></tbody></table></div>',
    );
  });
});

describe('code, media and embeds', () => {
  it('escapes code and exposes the language as a class', () => {
    assert.equal(
      html([node('code', { rich_text: [rt('if (a < b) {}')], language: 'TypeScript', caption: [rt('Example')] })]),
      '<figure class="code"><pre><code class="language-typescript">if (a &lt; b) {}</code></pre><figcaption>Example</figcaption></figure>',
    );
  });

  it('renders external images with their caption as alt text', () => {
    assert.equal(
      html([node('image', { type: 'external', external: { url: 'https://cdn.example.com/a.webp' }, caption: [rt('A chart')] })]),
      '<figure><img src="https://cdn.example.com/a.webp" alt="A chart" loading="lazy" decoding="async"><figcaption>A chart</figcaption></figure>',
    );
  });

  it('uses the signed proxy URL for images uploaded to Notion, never the expiring one', () => {
    const image = node('image', { type: 'file', file: { url: 'https://files.example/expiring?X-Amz-Expires=3600' }, caption: [] });
    const signed = '/notion-image/b/abc/v/sig';
    const out = renderBlocks([image], { imageUrls: new Map([[compactId(image.block.id), signed]]) });
    assert.match(out.html, /src="\/notion-image\/b\/abc\/v\/sig"/);
    assert.doesNotMatch(out.html, /X-Amz/);
    assert.deepEqual(renderBlocks([image]).unsupported, ['image without a usable source']);
  });

  it('embeds YouTube (privacy mode) and Vimeo (do-not-track), lazily', () => {
    const yt = html([node('video', { type: 'external', external: { url: 'https://youtu.be/dQw4w9WgXcQ' }, caption: [] })]);
    assert.match(yt, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
    assert.match(yt, /loading="lazy"/);
    const vimeo = html([node('embed', { url: 'https://vimeo.com/123456789', caption: [] })]);
    assert.match(vimeo, /src="https:\/\/player\.vimeo\.com\/video\/123456789\?dnt=1"/);
  });

  it('turns a paragraph that is only a pasted video link into the player, but keeps worded links', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    assert.match(html([para(rt(url, { href: url }))]), /<iframe/);
    assert.equal(html([para(rt('watch the demo', { href: url }))]), `<p><a href="${url}" rel="noopener">watch the demo</a></p>`);
  });

  it('renders other embeds and bookmarks as plain links, with no third-party script', () => {
    assert.equal(
      html([node('bookmark', { url: 'https://www.example.com/guide', caption: [] })]),
      '<p class="bookmark"><a href="https://www.example.com/guide" rel="noopener">example.com/guide</a></p>',
    );
  });

  it('reports files uploaded to Notion, which it does not proxy', () => {
    const result = renderBlocks([node('pdf', { type: 'file', file: { url: 'https://files.example/a.pdf' }, caption: [] })]);
    assert.equal(result.html, '');
    assert.deepEqual(result.unsupported, ['pdf uploaded to Notion']);
  });
});

describe('unknown and workspace-only blocks', () => {
  it('reports unsupported blocks and leaves a comment instead of dropping them silently', () => {
    const result = renderBlocks([node('ai_block', {}), para(rt('kept'))]);
    assert.equal(result.html, '<!-- unsupported Notion block: ai_block -->\n<p>kept</p>');
    assert.deepEqual(result.unsupported, ['ai_block']);
  });

  it('skips sub-pages and breadcrumbs without reporting them', () => {
    const result = renderBlocks([node('child_page', { title: 'Notes' }), node('breadcrumb', {})]);
    assert.equal(result.html, '');
    assert.deepEqual(result.unsupported, []);
  });

  it('collects the visible text', () => {
    assert.equal(renderBlocks([heading(1, 'Title'), para(rt('Hello'), rt(' world'))]).text, 'Title Hello world');
  });
});
