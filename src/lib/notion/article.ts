import type { NotionClient } from './client';
import type { BlogConfig } from './config';
import type { QA } from './faq';
import type { Post } from './posts';
import type { Heading, RenderOptions } from './render';
import type { NotionFile } from './types';
import { fetchBlockTree, walkBlocks } from './blocks';
import { extractFaq } from './faq';
import { imageVersion, signImagePath } from './images';
import { renderBlocks } from './render';
import { TAGS } from './tags';
import { compactId, readingMinutes } from './util';

export type Article = {
  post: Post;
  html: string;
  headings: Heading[];
  faq: QA[];
  readingMinutes: number;
  /** Block types the renderer does not support; the content check reports them. */
  unsupported: string[];
};

/** A page of another collection on the same site, for links between collections. */
export type LinkTarget = { id: string; href: string; title: string };

/**
 * Loads and renders one post: body tree, signed URLs for images uploaded to Notion, links to other
 * posts, FAQ pairs and reading time. Pass the full post list so links between posts resolve, and
 * `links` for pages of other collections (a customer story linking a blog post, say).
 */
export async function loadArticle(
  client: NotionClient,
  config: BlogConfig,
  post: Post,
  options: { imageKey: string; posts?: Post[]; links?: LinkTarget[] } & Pick<RenderOptions, 'headingOffset' | 'reservedIds'>,
): Promise<Article> {
  const tree = await fetchBlockTree(client, post.id, { tags: [TAGS.page(post.id)] });

  const imageUrls = new Map<string, string>();
  for (const { block } of walkBlocks(tree)) {
    if (block.type !== 'image' || (block.image as NotionFile).type !== 'file') continue;
    const version = imageVersion(block.last_edited_time ?? post.updatedAt);
    imageUrls.set(compactId(block.id), await signImagePath({ kind: 'block', id: block.id }, version, { key: options.imageKey, basePath: config.imagePath }));
  }

  const byId = new Map((options.posts ?? [post]).map((p) => [compactId(p.id), p]));
  const others = new Map((options.links ?? []).map((link) => [compactId(link.id), link]));
  const rendered = renderBlocks(tree, {
    imageUrls,
    headingOffset: options.headingOffset,
    reservedIds: options.reservedIds,
    resolvePage: (pageId) => {
      const target = byId.get(compactId(pageId));
      if (target) return { href: `${config.basePath}/${target.slug}`, title: target.title };
      const other = others.get(compactId(pageId));
      return other ? { href: other.href, title: other.title } : null;
    },
  });

  return {
    post,
    html: rendered.html,
    headings: rendered.headings,
    faq: extractFaq(tree),
    readingMinutes: readingMinutes(rendered.text),
    unsupported: rendered.unsupported,
  };
}
