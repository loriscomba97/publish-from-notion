# Rendering and content checks

Paragraphs with bold, italic, code, strikethrough, underline and links; headings, with anchors and an optional table of contents; bulleted, numbered and to-do lists, nested; toggles and toggle headings; quotes; callouts with their icon; code with a language class for your highlighter; images; YouTube and Vimeo as privacy-friendly players that load lazily; bookmarks and other embeds as plain links; tables with header rows and columns; columns; dividers; equations (as source text); synced blocks.

Headings shift down one level, so the post title stays the only `h1`. Anything unsupported is left out of the page, kept as an HTML comment and reported by the content check, so it never disappears silently. Links to other published posts become links to their pages on your site; links to any other page of your workspace are removed, so recognized workspace page links do not point readers into your private database. Visible text, images and other content still need editorial review.

## Limits

The template serves public articles, not confidential documents. The publish checkbox is an editorial switch, not an access-control system for content already downloaded or cached. Signed image paths contain content identifiers. Those identifiers are not API credentials. Previously issued image URLs and cached copies may remain accessible after a post is unpublished.

Uploaded video, PDF and audio blocks are skipped and reported; use external links instead. Equations render as source text. Embedded databases and child pages are skipped. The block loader stops with an error at its depth limit rather than silently truncating a deeply nested article. Synced content from an inaccessible page is omitted with a server warning. Review warnings before releasing.

## Checks

`npm run build` checks post metadata and article bodies before building when real Notion credentials are configured. `npm run check:content` performs the same content checks independently. Demo builds and builds without a token skip live content checks.

Errors include no published posts, missing titles or slugs, duplicate slugs, temporary Notion file links and editorial placeholders. Missing descriptions and alt text are warnings. These are build-time checks; webhook updates do not run this command. An editor can still publish invalid content after a build, so review posts and run the checks as part of your editorial process.

## Search output

Metadata, canonical URLs, JSON-LD, sitemap and RSS are generated from published posts. A heading named `FAQ` with at least two question-and-answer pairs can produce FAQPage data. `llms.txt` is a text index for tools that choose to read it. None of these guarantees search visibility, rankings or inclusion in an assistant’s answer.

[Back to README](../README.md)
