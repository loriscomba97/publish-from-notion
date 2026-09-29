# Changelog and customer stories

Next to the blog, the template can publish two more Notion databases: a changelog and customer stories. Both are optional. Each is on only while its database is set, and both use the same connection, webhook endpoint and image route as the blog.

## Changelog

One row per release. Short changes go in list properties, one per line; longer notes, screenshots and code go in the page itself. The changelog is one page at `/changelog`, each release with its own anchor, plus an RSS feed of releases at `/changelog/feed.xml`.

| Property | Type | What it does |
|---|---|---|
| `Name` | Title | The release's name, for example "Faster exports" |
| `Version` | Text | For example `2.3.0`. Gives the release its anchor, `#v2-3-0` |
| `Published` | Checkbox | Ticked means live |
| `Release date` | Date | Shown and used for sorting. Defaults to the page's creation date |
| `Product` | Select or text | Optional label, for sites with several products |
| `Summary` | Text | Optional line for the feed and `llms.txt` |
| `New`, `Improved`, `Fixed` | Text | One change per line. List markers typed at the start of a line, such as `- `, are removed |

A release needs a name or a version. The sections are configurable, for example to follow Keep a Changelog:

```ts
export const changelog = defineChangelogConfig({
  ...site,
  dataSource: process.env.NOTION_CHANGELOG_DATA_SOURCE ?? '',
  sections: [
    { label: 'Added', property: 'Added' },
    { label: 'Changed', property: 'Changed' },
    { label: 'Fixed', property: 'Fixed' },
  ],
});
```

Page bodies are on by default: each release's page content is rendered under its lists. That costs one cached Notion request per release, more for nested blocks. With `body: false`, a release needs at least one list item or a summary to appear.

## Customer stories

A second collection of articles at `/customers`, with the same rendering, metadata, FAQ and structured data as blog posts. Their structured data uses `Article` rather than `BlogPosting`.

A story database has the blog properties from the [setup guide](setup.md), plus:

| Property | Type | What it does |
|---|---|---|
| `Customer` | Text | The person quoted |
| `Role` | Text | Their role |
| `Company` | Text | Their company, shown above the title |
| `Pull quote` | Text | Shown on the card and at the top of the story |
| `Avatar` | Files or URL | A photo of the customer, served like the cover |
| `Featured` | Checkbox | Featured stories are listed first |

These names are set in `stories` in [`src/blog.config.ts`](../src/blog.config.ts): `extra` for text properties, `images` for image properties and `properties.featured` for the checkbox. The same options work for the blog, for example to list featured posts first.

Publish only quotes and details the customer has approved. Unpublishing a story removes it from the site, not from copies already made.

## Set up

1. Create the database in Notion and give your connection access to it, as for the blog.
2. Set `NOTION_CHANGELOG_DATA_SOURCE` or `NOTION_STORIES_DATA_SOURCE` to the database link, locally and on the host.
3. Optionally, let the kit add the properties: give the connection Update content and Insert content for a moment and run `npm run notion:setup -- --collection changelog` or `npm run notion:setup -- --collection stories`. Add `--demo` to create sample content as well: the kit's own releases, or two stories about invented companies. Then set the connection back to Read content.
4. Publish one row and open `/changelog` or `/customers`.

Once a collection is on, the navigation, home page, sitemap and `llms.txt` include it. `npm run check:content` checks every collection that is set; an empty changelog or story list is a warning, not an error.

## Publishing and links

Connection webhooks send events for every page the connection can read, so a subscription that works for the blog also covers these databases. Database automations belong to one database: add the same Send webhook automation to each database you publish from.

A story or release that mentions a published post links to that post on your site, and the other way round. Mentions of pages outside the published collections are removed.

[Back to README](../README.md)
