# Changelog

## 1.0.0 (2026-09-29)

First public release.

- **Core** (`src/lib/notion`, zero runtime dependencies): a client for Notion API version 2025-09-03 (data sources) that retries on rate limits and server errors; posts read from a database behind a checkbox, status or select publish rule; blocks rendered to escaped HTML, with heading anchors, table of contents, toggles, callouts, tables, columns, to-do lists, code and privacy-friendly YouTube and Vimeo players; links to other posts rewritten to their pages, links to the rest of the workspace removed.
- **Instant publishing:** one endpoint for database automations (shared secret, compared in constant time) and connection webhooks (HMAC-SHA256 signatures, verification handshake). Page events purge the post list and the edited page; broader events may purge all Notion data.
- **Images:** files uploaded to Notion served through signed URLs that can be cached for a year; SVGs sandboxed.
- **Search engines and AI assistants:** metadata, canonical URLs, one JSON-LD graph per post, FAQPage from the post's own FAQ section, sitemap, RSS feed and llms.txt.
- **Template:** a Next.js 16 site (home, blog index, posts, sitemap, robots, feed, llms.txt) with demo content that runs without a Notion account.
- **Tooling:** content checks before every build, `npm run notion:setup` to create the database properties, a mock Notion server for end-to-end tests, CI on Node.js 22 and 24.

### Release preparation

- Shorter README with setup, publishing, integration and rendering guides.
- Image host validation, upstream redirect rejection and a download timeout.
- Opt-in, bounded webhook verification logging during setup.
- Rejected ambiguous URL separators; workspace bookmarks follow the page-link privacy rules.
- Article depth overflow fails instead of silently dropping content.
- Connected builds check article bodies as well as metadata; demo mode stays noindex.
