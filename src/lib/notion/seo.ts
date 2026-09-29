import type { BlogConfig } from './config';
import type { QA } from './faq';
import type { Post } from './posts';

/**
 * Metadata and structured data built from the same post object the page renders, so the visible
 * article, the meta tags and the JSON-LD can never disagree.
 */

export type Publisher = { name: string; url: string; logo?: string };

export function absoluteUrl(config: Pick<BlogConfig, 'siteUrl'>, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${config.siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function postPath(config: BlogConfig, post: Pick<Post, 'slug'>): string {
  return `${config.basePath}/${post.slug}`;
}

/** Canonical URL: the post's own override (a post first published elsewhere), else its URL here. */
export function postUrl(config: BlogConfig, post: Pick<Post, 'slug' | 'canonicalUrl'>): string {
  return post.canonicalUrl || absoluteUrl(config, postPath(config, post));
}

export type PostMetadata = {
  title: string;
  description: string;
  canonical: string;
  openGraph: {
    type: 'article';
    url: string;
    title: string;
    description: string;
    siteName: string;
    publishedTime: string;
    modifiedTime: string;
    authors: string[];
    tags: string[];
    images: Array<{ url: string; alt: string }>;
  };
  twitter: { card: 'summary_large_image' | 'summary'; title: string; description: string; images: string[] };
};

/** Maps one to one onto Next.js `Metadata` (title, description, alternates.canonical, openGraph, twitter). */
export function postMetadata(config: BlogConfig, post: Post, options: { imageUrl?: string | null; imageAlt?: string } = {}): PostMetadata {
  const title = post.seoTitle || post.title;
  const description = post.metaDescription || post.excerpt;
  const url = postUrl(config, post);
  const image = options.imageUrl ? absoluteUrl(config, options.imageUrl) : '';
  return {
    title,
    description,
    canonical: url,
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: config.siteName,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: post.author ? [post.author] : [],
      tags: post.tags,
      images: image ? [{ url: image, alt: options.imageAlt ?? '' }] : [],
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : [] },
  };
}

/**
 * JSON-LD for a post page as one @graph: the article (BlogPosting, or the config's articleType),
 * WebPage, BreadcrumbList and, when the post has a real FAQ section, FAQPage. Nodes reference
 * each other by @id.
 */
export function postJsonLd(
  config: BlogConfig,
  post: Post,
  options: { imageUrl?: string | null; faq?: QA[]; authorUrl?: string; publisher?: Publisher } = {},
): Record<string, unknown> {
  const url = absoluteUrl(config, postPath(config, post));
  const site = config.siteUrl;
  const publisher = options.publisher ?? { name: config.siteName, url: site };
  const graph: Record<string, unknown>[] = [
    {
      '@type': config.articleType,
      '@id': `${url}#article`,
      headline: post.title,
      description: post.metaDescription || post.excerpt || undefined,
      url,
      mainEntityOfPage: { '@id': `${url}#webpage` },
      datePublished: post.publishedAt,
      dateModified: post.updatedAt || post.publishedAt,
      image: options.imageUrl ? absoluteUrl(config, options.imageUrl) : undefined,
      author: post.author ? { '@type': 'Person', name: post.author, ...(options.authorUrl ? { url: options.authorUrl } : {}) } : undefined,
      publisher: { '@id': `${site}/#publisher` },
      keywords: post.tags.length ? post.tags.join(', ') : undefined,
      articleSection: post.category || undefined,
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: post.seoTitle || post.title,
      isPartOf: { '@id': `${site}/#website` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: site },
        { '@type': 'ListItem', position: 2, name: config.label, item: absoluteUrl(config, config.basePath) },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
    { '@type': 'WebSite', '@id': `${site}/#website`, url: site, name: config.siteName, publisher: { '@id': `${site}/#publisher` } },
    {
      '@type': 'Organization',
      '@id': `${site}/#publisher`,
      name: publisher.name,
      url: publisher.url,
      ...(publisher.logo ? { logo: absoluteUrl(config, publisher.logo) } : {}),
    },
  ];
  if (options.faq && options.faq.length >= 2) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: options.faq.map((qa) => ({
        '@type': 'Question',
        name: qa.question,
        acceptedAnswer: { '@type': 'Answer', text: qa.answer },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/**
 * JSON-LD for a collection index: a Blog with its posts, or, for any other articleType, a
 * CollectionPage with its articles.
 */
export function blogJsonLd(config: BlogConfig, posts: Post[], options: { description?: string } = {}): Record<string, unknown> {
  const url = absoluteUrl(config, config.basePath);
  const entries = posts.map((post) => ({
    '@type': config.articleType,
    headline: post.title,
    url: absoluteUrl(config, postPath(config, post)),
    datePublished: post.publishedAt,
  }));
  if (config.articleType !== 'BlogPosting') {
    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${url}#collection`,
      url,
      name: `${config.label} | ${config.siteName}`,
      description: options.description,
      hasPart: entries,
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${url}#blog`,
    url,
    name: config.siteName,
    description: options.description,
    blogPost: entries,
  };
}

/**
 * Serialized JSON-LD, safe to inline in a <script> tag: "<" is escaped so text such as
 * "</script>" inside a title cannot close the tag early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
