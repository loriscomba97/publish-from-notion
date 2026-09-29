import { config, getPosts } from '@/lib/blog';
import { sitemapEntries, sitemapXml } from '@/lib/notion';

export const revalidate = 3600;

export async function GET() {
  const body = sitemapXml(sitemapEntries(config, await getPosts()));
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
