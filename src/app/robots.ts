import type { MetadataRoute } from 'next';
import { config, INDEXABLE } from '@/lib/blog';
import { absoluteUrl } from '@/lib/notion';

export default function robots(): MetadataRoute.Robots {
  // Staging, previews and the demo stay out of search engines entirely.
  if (!INDEXABLE) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    // Images are served from /notion-image, outside /api, so crawlers and link previews can load them.
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: absoluteUrl(config, '/sitemap.xml'),
  };
}
