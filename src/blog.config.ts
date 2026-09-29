import { defineBlogConfig } from './lib/notion';

/**
 * Your blog in one place. Property names must match your Notion database exactly
 * (see docs/setup.md for the full list and their defaults).
 *
 * Secrets never go in this file: they live in environment variables (see .env.example).
 */
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const blog = defineBlogConfig({
  // The database URL, its id or its data source id.
  dataSource: process.env.NOTION_DATA_SOURCE ?? '',
  siteUrl: process.env.SITE_URL ?? (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000'),
  siteName: 'Publish from Notion',
  description: 'A blog written in Notion and published with one checkbox.',
  basePath: '/blog',
  publish: { type: 'checkbox', property: 'Published' },
  properties: {
    // Rename to match your database, for example: title: 'Title', slug: 'URL'.
  },
});
