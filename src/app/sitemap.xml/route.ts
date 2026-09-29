import { config, getPosts } from '@/lib/blog';
import { sitemapEntries, sitemapXml } from '@/lib/notion';

/**
 * Rendered on every request. The post list still comes from the tagged data cache, so Notion is
 * only asked again after a webhook purge, but the response itself is never frozen: on Vercel the
 * /sitemap.xml path is served like a static file that tag purges do not reach, even as an
 * ordinary route handler, so a cached version kept listing unpublished posts.
 * `revalidate = 0` (rather than force-dynamic) keeps the data fetches cached.
 */
export const revalidate = 0;

export async function GET() {
  const body = sitemapXml(sitemapEntries(config, await getPosts()));
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
