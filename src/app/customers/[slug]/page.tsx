import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { StoryCard } from '@/components/StoryCard';
import { coverAltText, coverUrl, FEED_ALTERNATE, formatDate, getStories, getStoryArticle, imageUrl, STORIES_ON, storiesConfig } from '@/lib/blog';
import { findPost, postJsonLd, postMetadata, relatedPosts } from '@/lib/notion';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getStories()).map((story) => ({ slug: story.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = findPost(await getStories(), slug);
  if (!story) return {};
  const meta = postMetadata(storiesConfig, story, { imageUrl: await coverUrl(story), imageAlt: coverAltText(story) });
  return {
    title: story.seoTitle ? { absolute: meta.title } : meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical, types: FEED_ALTERNATE },
    openGraph: meta.openGraph,
    twitter: meta.twitter,
  };
}

export default async function StoryPage({ params }: Props) {
  if (!STORIES_ON) notFound();
  const { slug } = await params;
  const stories = await getStories();
  const story = findPost(stories, slug);
  if (!story) notFound();

  const [article, cover, avatar] = await Promise.all([getStoryArticle(story), coverUrl(story), imageUrl(story.images.avatar)]);
  const { customer, role, company, quote } = story.extra;
  const more = relatedPosts(stories, story, 2);

  return (
    <>
      <JsonLd data={postJsonLd(storiesConfig, story, { imageUrl: cover, faq: article.faq })} />
      <article className="post story">
        <header className="post-head">
          <Link href={storiesConfig.basePath} className="back">
            ← All stories
          </Link>
          <p className="eyebrow">
            {company && <span>{company}</span>}
            <time dateTime={story.publishedAt}>{formatDate(story.publishedAt)}</time>
          </p>
          <h1>{story.title}</h1>
          {story.excerpt && <p className="lede">{story.excerpt}</p>}
        </header>
        {quote && (
          <figure className="story-quote">
            <blockquote>
              <p>“{quote}”</p>
            </blockquote>
            {customer && (
              <figcaption className="person">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {avatar && <img src={avatar} alt="" width={44} height={44} decoding="async" />}
                <span>
                  <strong>{customer}</strong>
                  {[role, company].filter(Boolean).length > 0 && <>, {[role, company].filter(Boolean).join(', ')}</>}
                </span>
              </figcaption>
            )}
          </figure>
        )}
        {cover && (
          <figure className="post-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt={coverAltText(story)} fetchPriority="high" decoding="async" />
          </figure>
        )}
        <div className="prose" dangerouslySetInnerHTML={{ __html: article.html }} />
      </article>
      {more.length > 0 && (
        <aside className="container related" aria-labelledby="more-title">
          <h2 id="more-title">More stories</h2>
          <div className="cards cards-compact">
            {more.map((item) => (
              <StoryCard key={item.id} story={item} headingLevel={3} />
            ))}
          </div>
        </aside>
      )}
    </>
  );
}
