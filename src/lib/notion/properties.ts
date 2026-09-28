import type { NotionFile, NotionPage, PropertyValue, RichText } from './types';

/**
 * Tolerant readers for page properties. Each one accepts the property types a person is likely
 * to choose for that job (an author can be text, a select or a Notion person), so the database
 * can be set up the way its owner prefers without touching code.
 */

const field = <T>(value: PropertyValue, key: string) => value[key] as T;
const plain = (items: RichText[] | undefined) => (items ?? []).map((t) => t.plain_text).join('');

type Named = { name?: string } | null;
type Formula = { type: string; string?: string | null; number?: number | null; boolean?: boolean | null; date?: { start: string } | null };

export function readRichText(page: NotionPage, name: string): RichText[] {
  const value = page.properties[name];
  if (value?.type === 'title' || value?.type === 'rich_text') return field<RichText[]>(value, value.type) ?? [];
  return [];
}

export function readText(page: NotionPage, name: string): string {
  const value = page.properties[name];
  if (!value) return '';
  switch (value.type) {
    case 'title':
    case 'rich_text':
      return plain(field<RichText[]>(value, value.type)).trim();
    case 'select':
    case 'status':
      return field<Named>(value, value.type)?.name?.trim() ?? '';
    case 'multi_select':
      return readList(page, name).join(', ');
    case 'url':
    case 'email':
    case 'phone_number':
      return field<string | null>(value, value.type)?.trim() ?? '';
    case 'number': {
      const n = field<number | null>(value, 'number');
      return n === null || n === undefined ? '' : String(n);
    }
    case 'people':
      return field<Named[]>(value, 'people').map((p) => p?.name ?? '').filter(Boolean).join(', ');
    case 'created_by':
    case 'last_edited_by':
      return field<Named>(value, value.type)?.name ?? '';
    case 'formula': {
      const f = field<Formula>(value, 'formula');
      if (f.type === 'string') return f.string?.trim() ?? '';
      if (f.type === 'number' && typeof f.number === 'number') return String(f.number);
      return '';
    }
    default:
      return '';
  }
}

export function readCheckbox(page: NotionPage, name: string): boolean {
  const value = page.properties[name];
  if (value?.type === 'checkbox') return field<boolean>(value, 'checkbox') === true;
  if (value?.type === 'formula') return field<Formula>(value, 'formula').boolean === true;
  return false;
}

/** ISO date (or date-time) string, or '' when empty. */
export function readDate(page: NotionPage, name: string): string {
  const value = page.properties[name];
  if (!value) return '';
  switch (value.type) {
    case 'date':
      return field<{ start: string } | null>(value, 'date')?.start ?? '';
    case 'created_time':
    case 'last_edited_time':
      return field<string>(value, value.type) ?? '';
    case 'formula':
      return field<Formula>(value, 'formula').date?.start ?? '';
    default:
      return '';
  }
}

export function readList(page: NotionPage, name: string): string[] {
  const value = page.properties[name];
  if (!value) return [];
  switch (value.type) {
    case 'multi_select':
      return field<Named[]>(value, 'multi_select').map((o) => o?.name ?? '').filter(Boolean);
    case 'select':
    case 'status': {
      const option = field<Named>(value, value.type)?.name;
      return option ? [option] : [];
    }
    case 'people':
      return field<Named[]>(value, 'people').map((p) => p?.name ?? '').filter(Boolean);
    default:
      return [];
  }
}

/** Files from a files property, or a single external file from a URL or text property. */
export function readFiles(page: NotionPage, name: string): NotionFile[] {
  const value = page.properties[name];
  if (!value) return [];
  if (value.type === 'files') return field<NotionFile[]>(value, 'files') ?? [];
  const url = value.type === 'url' || value.type === 'rich_text' ? readText(page, name) : '';
  return url ? [{ type: 'external', external: { url } }] : [];
}
