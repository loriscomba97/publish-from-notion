import type { BlockNode } from './blocks';
import type { HeadingPayload, NotionBlock, TextPayload } from './types';
import { plainText } from './render';

/**
 * Question and answer pairs from a post's own FAQ section, for FAQPage structured data.
 *
 * It reads what readers see, word for word, and invents nothing: a post without a heading named
 * "FAQ", "FAQs" or "Frequently asked questions" yields nothing, and so does a section with fewer
 * than two pairs. Inside the section, a question is a toggle (answer inside it), a smaller
 * heading, or a paragraph that is entirely bold; the blocks after it are the answer.
 *
 * Note: Google stopped showing FAQ rich results in May 2026. The markup still describes the page
 * to crawlers and AI assistants; it is not a ranking trick.
 */

export type QA = { question: string; answer: string };

const FAQ_TITLE = /^(?:faqs?|frequently asked questions)\s*:?$/i;
const TEXT_BLOCKS = new Set(['paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'callout', 'to_do', 'toggle']);

const headingLevel = (block: NotionBlock) => (/^heading_[123]$/.test(block.type) ? Number(block.type.slice(-1)) : 0);
const blockText = (block: NotionBlock) => plainText((block[block.type] as TextPayload | undefined)?.rich_text).replace(/\s+/g, ' ').trim();
const toggleable = (block: NotionBlock) => headingLevel(block) > 0 && (block[block.type] as HeadingPayload).is_toggleable === true;

function isBoldParagraph(block: NotionBlock): boolean {
  if (block.type !== 'paragraph') return false;
  const rt = (block.paragraph as TextPayload).rich_text.filter((t) => t.plain_text.trim());
  return rt.length > 0 && rt.every((t) => t.annotations?.bold);
}

function answerText(nodes: BlockNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (TEXT_BLOCKS.has(node.block.type)) {
      const t = blockText(node.block);
      if (t) parts.push(t);
    }
    const nested = answerText(node.children);
    if (nested) parts.push(nested);
  }
  return parts.join(' ');
}

function pairsIn(section: BlockNode[]): QA[] {
  const pairs: QA[] = [];
  let open: { question: string; answer: BlockNode[] } | null = null;
  const close = () => {
    const answer = open ? answerText(open.answer) : '';
    if (open && open.question && answer) pairs.push({ question: open.question, answer });
    open = null;
  };
  for (const node of section) {
    const { block } = node;
    if (block.type === 'toggle' || toggleable(block)) {
      close();
      const question = blockText(block);
      const answer = answerText(node.children);
      if (question && answer) pairs.push({ question, answer });
    } else if (headingLevel(block) || isBoldParagraph(block)) {
      close();
      open = { question: blockText(block), answer: [] };
    } else if (open) {
      open.answer.push(node);
    }
  }
  close();
  return pairs;
}

export function extractFaq(nodes: BlockNode[]): QA[] {
  const index = nodes.findIndex((n) => headingLevel(n.block) > 0 && FAQ_TITLE.test(blockText(n.block)));
  const heading = nodes[index];
  if (!heading) return [];
  let section: BlockNode[];
  if (toggleable(heading.block)) {
    section = heading.children;
  } else {
    const level = headingLevel(heading.block);
    const end = nodes.findIndex((n, i) => i > index && headingLevel(n.block) > 0 && headingLevel(n.block) <= level);
    section = nodes.slice(index + 1, end === -1 ? undefined : end);
  }
  const pairs = pairsIn(section);
  return pairs.length >= 2 ? pairs : [];
}
