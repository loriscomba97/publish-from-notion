# Contributing

Thanks for helping. The kit does one thing, publishing a Notion database to a Next.js site, and small, focused changes are the easiest to merge.

## Before you start

- **Bugs:** open an issue with the steps to reproduce it. Never paste a Notion token, a verification token or private workspace content; the demo content or a throwaway workspace is enough.
- **Features:** open an issue first, so we can agree on the shape before you write code.
- **Security problems:** report them privately, never in a public issue. See [SECURITY.md](SECURITY.md).

## Set up

Requires Node.js 22.18 or later.

```bash
npm install
npm run dev         # the demo content, no Notion account needed
npm test            # core tests on Node's built-in runner
npm run typecheck
npm run demo        # production build with the demo content on port 3100
```

`scripts/mock-notion-server.ts` serves the demo workspace over HTTP, so you can test the whole publish flow, cache and webhook included, without a Notion account.

## Guidelines

- **The core stays dependency-free.** `src/lib/notion` uses only the platform (fetch and Web Crypto) and no framework code. Next.js wiring lives in `src/lib/blog.ts` and `src/app`.
- **Every behavior change comes with a test.** Tests run on `node:test`; `test/helpers.ts` builds Notion-shaped objects with made-up ids.
- **Everything from Notion is escaped.** Text goes through the escaping helpers and links through `safeHref`; a new block type follows the same rules.
- **The README stays true.** If a change affects setup, what gets rendered or a number in the README, update it in the same pull request.
- **No real data.** No tokens, emails or content from a real workspace, in code, tests or issues.

CI scans files across the history for credentials, keys and email addresses, then runs the type check, the tests and a build without Notion credentials. The hooks in `.githooks` are the maintainer's; you do not need them.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
