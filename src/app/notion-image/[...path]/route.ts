import { DEMO, filesFetch, IMAGE_KEY, notion } from '@/lib/blog';
import { serveNotionImage } from '@/lib/notion';

/**
 * Images uploaded to Notion, served from your own origin without embedding temporary upstream links.
 * Only paths signed by this site are served; the response is cached for a year and its URL
 * changes whenever the image is edited.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return serveNotionImage(path, { client: notion, key: IMAGE_KEY, fetch: filesFetch, allowedFileHosts: DEMO ? ['files.demo.invalid'] : [] });
}
