import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractFaq } from '../src/lib/notion/faq';
import type { Post } from '../src/lib/notion/posts';
import { relatedPosts } from '../src/lib/notion/related';
import { heading, para, rt, toggle } from './helpers';

const bold = (text: string) => para(rt(text, { bold: true }));
const text = (value: string) => para(rt(value));

describe('extractFaq', () => {
  it('reads bold questions followed by answer paragraphs, word for word', () => {
    const faq = extractFaq([
      text('Intro'),
      heading(1, 'FAQ'),
      bold('Is it free?'),
      text('Yes.'),
      text('Forever.'),
      bold('Does it need a server?'),
      text('Any Next.js host works.'),
      heading(1, 'Next section'),
      bold('Not a question'),
      text('Outside the FAQ.'),
    ]);
    assert.deepEqual(faq, [
      { question: 'Is it free?', answer: 'Yes. Forever.' },
      { question: 'Does it need a server?', answer: 'Any Next.js host works.' },
    ]);
  });

  it('reads toggles as question and answer', () => {
    const faq = extractFaq([
      heading(2, 'Frequently asked questions:'),
      toggle('How fast is publishing?', [text('A few seconds.')]),
      toggle('Can I unpublish?', [text('Untick the box.')]),
    ]);
    assert.deepEqual(faq.map((q) => q.question), ['How fast is publishing?', 'Can I unpublish?']);
  });

  it('reads smaller headings as questions, inside a toggle FAQ heading too', () => {
    const faq = extractFaq([
      heading(1, 'FAQs', { toggleable: true, children: [heading(2, 'One?'), text('First.'), heading(2, 'Two?'), text('Second.')] }),
    ]);
    assert.deepEqual(faq, [
      { question: 'One?', answer: 'First.' },
      { question: 'Two?', answer: 'Second.' },
    ]);
  });

  it('emits nothing without a FAQ heading or with a single pair', () => {
    assert.deepEqual(extractFaq([bold('Question?'), text('Answer.')]), []);
    assert.deepEqual(extractFaq([heading(1, 'FAQ'), bold('Only one?'), text('Yes.')]), []);
  });
});

function fakePost(id: string, category = '', tags: string[] = []): Post {
  return {
    id,
    slug: id,
    slugInput: id,
    title: id,
    excerpt: '',
    seoTitle: '',
    metaDescription: '',
    canonicalUrl: '',
    category,
    tags,
    author: '',
    publishedAt: '2026-09-01',
    dateSource: 'property',
    updatedAt: '2026-09-01',
    cover: null,
    coverAlt: '',
    coverIsAi: false,
  };
}

describe('relatedPosts', () => {
  it('links every post from exactly one other post through the ring slot', () => {
    const posts = Array.from({ length: 7 }, (_, i) => fakePost(`p${i}`, i % 2 ? 'a' : 'b'));
    const inbound = new Map(posts.map((p) => [p.id, 0]));
    for (const post of posts) {
      const ring = relatedPosts(posts, post).at(-1);
      assert.ok(ring);
      inbound.set(ring.id, (inbound.get(ring.id) ?? 0) + 1);
    }
    assert.deepEqual([...inbound.values()], posts.map(() => 1));
  });

  it('prefers the same category and shared tags, never repeats a post or includes the current one', () => {
    const posts = [fakePost('current', 'guides', ['notion']), fakePost('next'), fakePost('other'), fakePost('same-cat', 'guides'), fakePost('same-tag', '', ['notion'])];
    const picks = relatedPosts(posts, posts[0] as Post);
    assert.deepEqual(picks.map((p) => p.id), ['same-cat', 'same-tag', 'next']);
  });

  it('handles tiny blogs', () => {
    const only = fakePost('only');
    assert.deepEqual(relatedPosts([only], only), []);
    const two = [fakePost('a'), fakePost('b')];
    assert.deepEqual(relatedPosts(two, two[0] as Post).map((p) => p.id), ['b']);
  });
});
