import type { Post } from './posts';

/**
 * "Keep reading" picks that leave no post orphaned.
 *
 * Picking only by topic keeps surfacing the same few recent posts, so older ones end up with no
 * link pointing at them from anywhere on the site. One slot is therefore a ring pick: in the
 * newest-first list, each post links the next one and the oldest wraps to the newest. By
 * construction every post is linked from exactly one other post, however many are added.
 * The other slots are the closest by category and shared tags, in a stable order.
 */
export function relatedPosts<T extends Pick<Post, 'id' | 'category' | 'tags'>>(posts: T[], current: T, count = 3): T[] {
  const index = posts.findIndex((p) => p.id === current.id);
  const ring = index >= 0 && posts.length > 1 ? posts[(index + 1) % posts.length] : undefined;
  const tags = new Set(current.tags);
  const topical = posts
    .map((post, order) => ({
      post,
      order,
      score: (current.category && post.category === current.category ? 2 : 0) + post.tags.filter((t) => tags.has(t)).length,
    }))
    .filter(({ post }) => post.id !== current.id && post.id !== ring?.id)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, count - (ring ? 1 : 0)))
    .map(({ post }) => post);
  return ring && count > 0 ? [...topical, ring] : topical;
}
