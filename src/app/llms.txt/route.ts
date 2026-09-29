import { CHANGELOG_ON, changelogConfig, config, getPosts, getReleases, getStories, STORIES_ON, storiesConfig } from '@/lib/blog';
import { absoluteUrl, changelogLlmsSection, llmsTxt, postPath, type LlmsSection } from '@/lib/notion';

export const revalidate = 3600;

export async function GET() {
  const [posts, stories, releases] = await Promise.all([getPosts(), getStories(), getReleases()]);
  const sections: LlmsSection[] = [];
  if (STORIES_ON) {
    sections.push({
      title: storiesConfig.label,
      links: stories.map((story) => ({
        title: story.title,
        url: absoluteUrl(storiesConfig, postPath(storiesConfig, story)),
        description: story.metaDescription || story.excerpt,
      })),
    });
  }
  if (CHANGELOG_ON) sections.push(changelogLlmsSection(changelogConfig, releases));
  const body = llmsTxt(config, posts, { summary: config.description, sections });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
