/**
 * The demo workspace served over HTTP, for testing the template end to end with Next's real
 * caching, no Notion account needed:
 *
 *   node --import ./scripts/register.mjs scripts/mock-notion-server.ts
 *   NOTION_API_URL=http://127.0.0.1:4010/v1 NOTION_TOKEN=anything NOTION_DATA_SOURCE=de000000-0000-4000-8000-000000000000
 *
 * Edit a post the way an editor would in Notion, then call the webhook and watch it change:
 *   curl -X POST localhost:4010/__mock/edit -d '{"slug":"instant-publishing","title":"New title"}'
 *   curl -X POST localhost:4010/__mock/edit -d '{"slug":"instant-publishing","published":false}'
 */
import { createServer } from 'node:http';
import { demoFetch, pages } from '../src/lib/demo/notion';
import type { NotionPage } from '../src/lib/notion/types';

const port = Number(process.env.MOCK_NOTION_PORT ?? 4010);
const origin = `http://127.0.0.1:${port}`;

function slugOf(page: NotionPage): string {
  const value = page.properties.Slug;
  const rich = value?.type === 'rich_text' ? (value.rich_text as Array<{ plain_text: string }>) : [];
  return rich.map((t) => t.plain_text).join('');
}

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString('utf8');
  const url = new URL(req.url ?? '/', origin);
  console.log(`[mock notion] ${req.method} ${url.pathname}`);

  if (req.method === 'POST' && url.pathname === '/__mock/edit') {
    const edit = JSON.parse(body || '{}') as { slug?: string; title?: string; published?: boolean };
    const page = [...pages.values()].find((p) => slugOf(p) === edit.slug);
    if (!page) {
      res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'no such slug' }));
      return;
    }
    if (edit.title) page.properties.Name = { id: 'title', type: 'title', title: [{ type: 'text', plain_text: edit.title, href: null, annotations: {} }] };
    if (typeof edit.published === 'boolean') page.properties.Published = { id: 'pub', type: 'checkbox', checkbox: edit.published };
    page.last_edited_time = new Date().toISOString();
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, id: page.id }));
    return;
  }

  const isFile = url.pathname.startsWith('/files/');
  if (!isFile && (!req.headers.authorization?.startsWith('Bearer ') || !req.headers['notion-version'])) {
    res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'error', status: 401, code: 'unauthorized', message: 'Missing auth headers.' }));
    return;
  }
  const target = isFile ? `https://files.demo.invalid/${url.pathname.slice('/files/'.length)}` : `https://api.notion.com${url.pathname}${url.search}`;
  const response = await demoFetch(target, { method: req.method, body: body || undefined });
  // File URLs in API answers point back at this server, the way Notion's point at its storage.
  const text = (await response.text()).replaceAll('https://files.demo.invalid/', `${origin}/files/`);
  res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' }).end(text);
}).listen(port, '127.0.0.1', () => console.log(`[mock notion] listening on ${origin}`));
