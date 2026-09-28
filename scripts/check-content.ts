/**
 * Content check, run before every `next build` (npm "prebuild"). It fails the build when
 * published content has an error: an empty blog from an expired token, a published row that
 * cannot go online, a temporary Notion file link, a draft note left in the text. Warnings are
 * printed and the build goes on.
 *
 *   --bodies     also load and check every article body (one extra API call per post and block)
 *   --warn-only  print everything, never fail
 *
 * Without NOTION_TOKEN (fresh clone, demo, CI without secrets) it skips.
 */
import { blog } from '../src/blog.config';
import { checkContent, createNotionClient, formatIssues, loadArticle, queryPosts } from '../src/lib/notion';

const args = new Set(process.argv.slice(2));
const token = process.env.NOTION_TOKEN;

if (!token || process.env.NOTION_DEMO === '1') {
  console.log('check-content: no NOTION_TOKEN, skipped.');
  process.exit(0);
}

const client = createNotionClient({ token, baseUrl: process.env.NOTION_API_URL });
const { posts, skipped } = await queryPosts(client, blog);
const articles = args.has('--bodies')
  ? await Promise.all(posts.map((post) => loadArticle(client, blog, post, { imageKey: token, posts })))
  : undefined;

const issues = checkContent({ configured: true, posts, skipped, articles });
const errors = issues.filter((issue) => issue.level === 'error').length;

console.log(`check-content: ${posts.length} published post(s), ${errors} error(s), ${issues.length - errors} warning(s).`);
if (issues.length) console.log(formatIssues(issues));
if (errors && !args.has('--warn-only')) {
  console.error('check-content: fix the errors above in Notion, or run with --warn-only to build anyway.');
  process.exit(1);
}
