import type { MetadataRoute } from 'next';
import { config, getPosts } from '@/lib/blog';
import { absoluteUrl, postPath } from '@/lib/notion';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  // Posts whose canonical URL lives on another site belong to that site's sitemap.
  const own = posts.filter((post) => !post.canonicalUrl || post.canonicalUrl === absoluteUrl(config, postPath(config, post)));
  return [
    { url: absoluteUrl(config, '/') },
    { url: absoluteUrl(config, config.basePath), lastModified: posts[0]?.updatedAt },
    ...own.map((post) => ({ url: absoluteUrl(config, postPath(config, post)), lastModified: post.updatedAt })),
  ];
}
