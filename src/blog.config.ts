import { defineBlogConfig, defineChangelogConfig } from './lib/notion';

/**
 * Your site's collections in one place. Property names must match your Notion databases exactly
 * (see docs/setup.md for the full lists and their defaults).
 *
 * Secrets never go in this file: they live in environment variables (see .env.example).
 */
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

/** Shared by every collection. */
const site = {
  siteUrl: process.env.SITE_URL ?? (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000'),
  siteName: 'Publish from Notion',
  description: 'A blog written in Notion and published with one checkbox.',
};

export const blog = defineBlogConfig({
  ...site,
  // The database URL, its id or its data source id.
  dataSource: process.env.NOTION_DATA_SOURCE ?? '',
  basePath: '/blog',
  publish: { type: 'checkbox', property: 'Published' },
  properties: {
    // Rename to match your database, for example: title: 'Title', slug: 'URL'.
  },
});

/**
 * Customer stories: a second database of articles, each with the customer's name, role, company,
 * a pull quote and a photo. Optional: with NOTION_STORIES_DATA_SOURCE empty, the section is off.
 */
export const stories = defineBlogConfig({
  ...site,
  dataSource: process.env.NOTION_STORIES_DATA_SOURCE ?? '',
  basePath: '/customers',
  label: 'Customer stories',
  articleType: 'Article',
  publish: { type: 'checkbox', property: 'Published' },
  properties: { featured: 'Featured' },
  extra: { customer: 'Customer', role: 'Role', company: 'Company', quote: 'Pull quote' },
  images: { avatar: 'Avatar' },
});

/**
 * The changelog: one database row per release, with its changes in the New, Improved and Fixed
 * properties (one per line) and, if you like, longer notes in the page itself. Optional: with
 * NOTION_CHANGELOG_DATA_SOURCE empty, the section is off.
 */
export const changelog = defineChangelogConfig({
  ...site,
  dataSource: process.env.NOTION_CHANGELOG_DATA_SOURCE ?? '',
  basePath: '/changelog',
  publish: { type: 'checkbox', property: 'Published' },
});
