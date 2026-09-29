import { CHANGELOG_ON, changelogConfig, getReleases } from '@/lib/blog';
import { changelogFeed } from '@/lib/notion';

export const revalidate = 3600;

export async function GET() {
  if (!CHANGELOG_ON) return new Response('Not found', { status: 404 });
  const feed = changelogFeed(changelogConfig, await getReleases());
  return new Response(feed, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
