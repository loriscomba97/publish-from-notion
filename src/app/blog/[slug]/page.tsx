import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { PostCard } from '@/components/PostCard';
import { config, coverAltText, coverUrl, FEED_ALTERNATE, formatDate, getArticle, getPosts, SHARE_IMAGE } from '@/lib/blog';
import { findPost, postJsonLd, postMetadata, relatedPosts } from '@/lib/notion';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getPosts()).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(await getPosts(), slug);
  if (!post) return {};
  // A post without a cover shares the site's default image.
  const cover = await coverUrl(post);
  const meta = postMetadata(config, post, cover ? { imageUrl: cover, imageAlt: coverAltText(post) } : { imageUrl: SHARE_IMAGE.url, imageAlt: SHARE_IMAGE.alt });
  return {
    // A title written for search in Notion is used as is; otherwise the site name is appended.
    title: post.seoTitle ? { absolute: meta.title } : meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical, types: FEED_ALTERNATE },
    authors: post.author ? [{ name: post.author }] : undefined,
    openGraph: meta.openGraph,
    twitter: meta.twitter,
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const posts = await getPosts();
  // Exact URLs only. A redirect issued here would be cached by ISR as a 308 without a Location
  // header, which crawlers cannot follow; a wrong-case or mistyped URL is a clean 404 instead.
  const post = findPost(posts, slug);
  if (!post) notFound();

  const article = await getArticle(post);
  const cover = await coverUrl(post);
  const related = relatedPosts(posts, post);

  return (
    <>
      <JsonLd data={postJsonLd(config, post, { imageUrl: cover, faq: article.faq })} />
      <article className="post">
        <header className="post-head">
          <Link href={config.basePath} className="back">
            ← All posts
          </Link>
          {post.category && <p className="eyebrow">{post.category}</p>}
          <h1>{post.title}</h1>
          {post.excerpt && <p className="lede">{post.excerpt}</p>}
          <p className="post-meta">
            {post.author && <span>{post.author}</span>}
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            <span>{article.readingMinutes} min read</span>
          </p>
        </header>
        {cover && (
          <figure className="post-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt={coverAltText(post)} fetchPriority="high" decoding="async" />
          </figure>
        )}
        <div className="prose" dangerouslySetInnerHTML={{ __html: article.html }} />
      </article>
      {related.length > 0 && (
        <aside className="container related" aria-labelledby="related-title">
          <h2 id="related-title">Keep reading</h2>
          <div className="cards cards-compact">
            {related.map((item) => (
              <PostCard key={item.id} post={item} headingLevel={3} />
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
