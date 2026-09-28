import { config, getPosts } from '@/lib/blog';
import { llmsTxt } from '@/lib/notion';

export const revalidate = 3600;

export async function GET() {
  const body = llmsTxt(config, await getPosts(), { summary: config.description });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
