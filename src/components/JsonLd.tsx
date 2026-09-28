import { serializeJsonLd } from '@/lib/notion';

/** Structured data in the server HTML, escaped so no text can close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
