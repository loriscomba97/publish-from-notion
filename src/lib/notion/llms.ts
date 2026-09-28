import type { BlogConfig } from './config';
import type { Post } from './posts';
import { absoluteUrl, postPath } from './seo';

export type LlmsLink = { title: string; url: string; description?: string };
export type LlmsSection = { title: string; links: LlmsLink[] };

/**
 * llms.txt (llmstxt.org): a Markdown map of the site for AI assistants and agents, generated from
 * the same post list as the sitemap so the two never drift. It helps tools that read it; search
 * engines do not need it to rank you.
 */
export function llmsTxt(
  config: BlogConfig,
  posts: Post[],
  options: { summary?: string; sections?: LlmsSection[] } = {},
): string {
  const line = (link: LlmsLink) =>
    `- [${link.title.replace(/[[\]]/g, '')}](${link.url})${link.description ? `: ${link.description.replace(/\s+/g, ' ').trim()}` : ''}`;
  const blog: LlmsSection = {
    title: 'Blog',
    links: posts.map((post) => ({
      title: post.title,
      url: absoluteUrl(config, postPath(config, post)),
      description: post.metaDescription || post.excerpt,
    })),
  };
  const out = [`# ${config.siteName}`, ''];
  if (options.summary) out.push(`> ${options.summary.replace(/\s+/g, ' ').trim()}`, '');
  for (const section of [...(options.sections ?? []), blog]) {
    if (!section.links.length) continue;
    out.push(`## ${section.title}`, '', ...section.links.map(line), '');
  }
  return out.join('\n');
}
