import { config, getPosts } from '@/lib/blog';
import { rssFeed } from '@/lib/notion';

export const revalidate = 3600;

export async function GET() {
  const feed = rssFeed(config, await getPosts(), { description: config.description });
  return new Response(feed, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
