/**
 * Content check, run before every `next build` (npm "prebuild"). It fails the build when
 * published content has an error: an empty blog from an expired token, a published row that
 * cannot go online, a temporary Notion file link, a draft note left in the text. Warnings are
 * printed and the build goes on. Customer stories and the changelog are checked too when their
 * databases are set; an empty one is only a warning.
 *
 *   --bodies     also load and check every article body (one extra API call per post and block)
 *   --warn-only  print everything, never fail
 *
 * Without NOTION_TOKEN (fresh clone, demo, CI without secrets) it skips.
 */
import { blog, changelog, stories } from '../src/blog.config';
import {
  checkContent,
  checkReleases,
  createNotionClient,
  formatIssues,
  loadArticle,
  loadReleaseNotes,
  queryPosts,
  queryReleases,
  type Issue,
  type ReleaseNotes,
} from '../src/lib/notion';

const args = new Set(process.argv.slice(2));
const token = process.env.NOTION_TOKEN;

if (!token || process.env.NOTION_DEMO === '1') {
  console.log('check-content: no NOTION_TOKEN, skipped.');
  process.exit(0);
}

const client = createNotionClient({ token, baseUrl: process.env.NOTION_API_URL });
const bodies = args.has('--bodies');
const issues: Issue[] = [];
const counts: string[] = [];

const { posts, skipped } = await queryPosts(client, blog);
const articles = bodies ? await Promise.all(posts.map((post) => loadArticle(client, blog, post, { imageKey: token, posts }))) : undefined;
issues.push(...checkContent({ configured: true, posts, skipped, articles }));
counts.push(`${posts.length} post(s)`);

if (stories.dataSource) {
  const { posts: entries, skipped: skippedStories } = await queryPosts(client, stories);
  const storyArticles = bodies
    ? await Promise.all(entries.map((story) => loadArticle(client, stories, story, { imageKey: token, posts: entries })))
    : undefined;
  issues.push(...checkContent({ configured: true, posts: entries, skipped: skippedStories, articles: storyArticles, collection: 'stories', allowEmpty: true }));
  counts.push(`${entries.length} stor${entries.length === 1 ? 'y' : 'ies'}`);
}

if (changelog.dataSource) {
  const { releases, skipped: skippedReleases } = await queryReleases(client, changelog);
  let notes: Map<string, ReleaseNotes> | undefined;
  if (bodies && changelog.body) {
    notes = new Map();
    for (const release of releases) notes.set(release.id, await loadReleaseNotes(client, changelog, release, { imageKey: token }));
  }
  issues.push(...checkReleases({ releases, skipped: skippedReleases, notes, collection: 'changelog' }));
  counts.push(`${releases.length} release(s)`);
}

const errors = issues.filter((issue) => issue.level === 'error').length;
console.log(`check-content: ${counts.join(', ')} published; ${errors} error(s), ${issues.length - errors} warning(s).`);
if (issues.length) console.log(formatIssues(issues));
if (errors && !args.has('--warn-only')) {
  console.error('check-content: fix the errors above in Notion, or run with --warn-only to build anyway.');
  process.exit(1);
}
