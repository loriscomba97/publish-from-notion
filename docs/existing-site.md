# Add it to an existing Next.js site

Copy these into your project at the same paths under `src/`; the imports use the `@/*` alias for `src/*`.

- [`src/lib/notion`](../src/lib/notion): the core, with no dependencies. Leave it unchanged: everything specific to your site goes in the config.
- [`src/blog.config.ts`](../src/blog.config.ts): your property names, publish rule and site details.
- [`src/lib/blog.ts`](../src/lib/blog.ts) and [`src/lib/demo`](../src/lib/demo): the Next.js wiring, and the demo content it falls back to. To drop the demo, remove the `DEMO` branches from `blog.ts`.
- [`src/components`](../src/components): the post card, the JSON-LD tag and the setup notice that the pages use.
- The routes you want from [`src/app`](../src/app): `blog` (index, posts and feed), `notion-image`, `api/notion-webhook`, and optionally `sitemap.xml`, `robots.ts` and `llms.txt`. If your site already has a sitemap or robots file, merge the entries instead.
- The article styles: the "Article body" section of [`src/app/globals.css`](../src/app/globals.css), adapted to your design.

The supported template targets Next.js 16. An older Next.js application needs an adapter for its cache invalidation and route parameter APIs; copying the template unchanged is not supported. Check the documentation for your installed version. The core does not import Next.js, but this is not a compatibility guarantee for other frameworks. The core uses Unicode regular expressions; use a TypeScript target of ES2018 or later.

Using a coding agent? [AGENTS.md](../AGENTS.md) walks it through the same steps.

Copy `.env.example` and review its variables. The Next.js project must supply React and the `@/*` alias. Merge the template’s security headers from `next.config.ts` into your host configuration. Test existing routes, blog pages, the feed, sitemap, signed images and an unauthorized webhook request before deploying.

[Back to README](../README.md)
