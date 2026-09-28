/**
 * Lets Node run the TypeScript sources directly (Node strips the types natively), with the same
 * extensionless relative imports a Next.js project uses: "./client" resolves to "./client.ts",
 * "./lib/notion" to "./lib/notion/index.ts".
 * No test framework and no transpiler: `node --import ./scripts/register.mjs --test`.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const url = new URL(candidate, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
