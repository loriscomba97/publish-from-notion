# AGENTS.md

Instructions for coding agents working with this repository.

## What this is

publish-from-notion publishes a Notion database as a blog on a Next.js site: a dependency-free core in `src/lib/notion` and a Next.js 16 template around it. [README.md](README.md) is the source of truth for setup and behavior; read it first.

## Adding the blog to an existing Next.js site

When a user asks you to add a Notion blog to their site:

1. **Check the project.** It needs the App Router, TypeScript with a `target` of ES2018 or later, and the `@/*` import alias for `src/*`. If the alias differs, adjust the imports of the copied files.
2. **Copy the files** listed in `docs/existing-site.md`, at the same paths. Do not edit `src/lib/notion`: everything specific to the site goes in `src/blog.config.ts`.
3. **Match the user's Notion database.** Set the property names, the publish rule and the cover properties in `src/blog.config.ts`. Ask the user for the names instead of guessing them.
4. **Match their Next.js version**, as `docs/existing-site.md` describes. On Next.js 16, keep the template as it is.
5. **Set up the environment.** Add the variables from `.env.example` to `.env.local` with empty values and ask the user to paste them. Never write a real token into a committed file, and never print one.
6. **Style the article body** with the user's design, starting from the "Article body" section of `src/app/globals.css`.
7. **Verify.** `npm run build` passes; `/blog`, one post and `/sitemap.xml` render; `POST /api/notion-webhook` without a secret answers 401.
8. **Offer the optional collections** when the site has releases or case studies: a changelog and customer stories, as `docs/collections.md` describes.
9. **Hand over the Notion side.** Point the user to the README section "Instant publishing": a database automation on paid plans, or a connection webhook on any plan.

## Working on this repository

- Node.js 22.18 or later. `npm test` runs the core tests on `node:test`; also `npm run typecheck`, `npm run demo` (a production build with the demo content on port 3100) and `npm run check:safety`.
- The core stays free of dependencies and framework code; the Next.js wiring lives in `src/lib/blog.ts` and `src/app`.
- Every behavior change comes with a test. Build Notion objects with `test/helpers.ts`, using made-up ids and content.
- Everything from Notion is escaped: links go through `safeHref`, media through `safeSrc`.
- Keep the README true: update it in the same change when setup, rendering or a documented number changes.
- Next.js 16 differs from earlier versions. Before changing framework code, read the documentation bundled in `node_modules/next/dist/docs`.
- Never commit `.env*` files other than `.env.example`, and never commit tokens, email addresses or content from a real workspace.
