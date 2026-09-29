import type { NotionClient } from './client';
import type { NotionBlock, SyncedPayload } from './types';
import { NotionApiError } from './client';

export type BlockNode = { block: NotionBlock; children: BlockNode[] };

/** Blocks whose children are other pages of the workspace, not part of the article. */
const OUTSIDE_ARTICLE = new Set(['child_page', 'child_database']);

/**
 * Loads a page body as a tree. Sibling subtrees load in parallel, bounded by the client's
 * concurrency limit. Any API failure throws, so an article is never rendered with parts missing,
 * except one case: a synced block copied from a page the connection cannot read renders empty
 * (with a warning) instead of taking the whole article down.
 */
export async function fetchBlockTree(
  client: NotionClient,
  rootId: string,
  options: { tags?: string[]; maxDepth?: number; log?: (message: string) => void } = {},
): Promise<BlockNode[]> {
  const maxDepth = options.maxDepth ?? 8;
  const log = options.log ?? ((message: string) => console.warn(`[notion] ${message}`));

  async function level(id: string, depth: number): Promise<BlockNode[]> {
    const blocks = await client.listBlockChildren(id, { tags: options.tags ?? [] });
    return Promise.all(blocks.map(async (block) => ({ block, children: await childrenOf(block, depth) })));
  }

  async function childrenOf(block: NotionBlock, depth: number): Promise<BlockNode[]> {
    if (!block.has_children || OUTSIDE_ARTICLE.has(block.type)) return [];
    if (depth + 1 >= maxDepth) throw new Error('Article nesting exceeds the supported depth. Simplify the nested blocks.');
    const original = block.type === 'synced_block' ? (block.synced_block as SyncedPayload).synced_from?.block_id : undefined;
    if (!original) return level(block.id, depth + 1);
    try {
      return await level(original, depth + 1);
    } catch (error) {
      if (error instanceof NotionApiError && (error.status === 404 || error.status === 403)) {
        log(`synced block ${block.id} copies a block the connection cannot read; it renders empty. Share its source page with the connection.`);
        return [];
      }
      throw error;
    }
  }

  return level(rootId, 0);
}

/** Every node of the tree, depth first. */
export function walkBlocks(nodes: BlockNode[]): BlockNode[] {
  return nodes.flatMap((node) => [node, ...walkBlocks(node.children)]);
}
