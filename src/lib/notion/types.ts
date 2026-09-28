/**
 * The slice of the Notion object model this kit reads (API version 2025-09-03).
 * Deliberately partial: fields the kit never touches are left out instead of being typed loosely.
 */

export type Annotations = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
};

export type RichText = {
  type: 'text' | 'mention' | 'equation';
  plain_text: string;
  href: string | null;
  annotations?: Annotations;
  mention?: {
    type: string;
    page?: { id: string };
    database?: { id: string };
    user?: { id: string; name?: string };
    date?: { start: string; end: string | null };
  };
  equation?: { expression: string };
};

export type NotionFile =
  | { type: 'external'; external: { url: string }; name?: string; caption?: RichText[] }
  | { type: 'file'; file: { url: string; expiry_time?: string }; name?: string; caption?: RichText[] }
  | { type: 'file_upload'; file_upload: { id: string }; name?: string; caption?: RichText[] };

/** A page property value. The payload sits under the key named by `type`. */
export type PropertyValue = { id: string; type: string } & Record<string, unknown>;

export type NotionParent =
  | { type: 'data_source_id'; data_source_id: string; database_id?: string }
  | { type: 'database_id'; database_id: string }
  | { type: 'page_id'; page_id: string }
  | { type: 'block_id'; block_id: string }
  | { type: 'workspace'; workspace: true };

export type NotionPage = {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  in_trash?: boolean;
  cover: NotionFile | null;
  parent?: NotionParent;
  properties: Record<string, PropertyValue>;
};

/** A block. Its payload sits under the key named by `type`, e.g. `block.paragraph`. */
export type NotionBlock = {
  object: 'block';
  id: string;
  type: string;
  has_children: boolean;
  last_edited_time?: string;
} & Record<string, unknown>;

export type NotionList<T> = {
  object: 'list';
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
};

// Block payloads read by the renderer.
export type TextPayload = { rich_text: RichText[] };
export type HeadingPayload = TextPayload & { is_toggleable?: boolean };
export type ToDoPayload = TextPayload & { checked: boolean };
export type CalloutPayload = TextPayload & { icon: { type: 'emoji'; emoji: string } | { type: string } | null };
export type CodePayload = { rich_text: RichText[]; caption?: RichText[]; language?: string };
export type LinkPayload = { url: string; caption?: RichText[] };
export type TablePayload = { has_column_header: boolean; has_row_header: boolean };
export type TableRowPayload = { cells: RichText[][] };
export type SyncedPayload = { synced_from: { block_id: string } | null };
export type EquationPayload = { expression: string };
export type LinkToPagePayload = { type: 'page_id'; page_id: string } | { type: 'database_id'; database_id: string };
