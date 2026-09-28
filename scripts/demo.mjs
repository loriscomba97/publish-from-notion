/**
 * Production build and server with the built-in demo content, no Notion needed:
 * `npm run demo`, then open http://localhost:3100. Works the same on every OS.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const next = fileURLToPath(import.meta.resolve('next/dist/bin/next'));
const port = process.env.PORT ?? '3100';
const env = { ...process.env, NOTION_DEMO: '1', SITE_URL: process.env.SITE_URL ?? `http://localhost:${port}` };

const build = spawnSync(process.execPath, [next, 'build'], { stdio: 'inherit', env });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, [next, 'start', '--port', port], { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
