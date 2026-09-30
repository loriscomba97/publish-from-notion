import type { Metadata } from 'next';
import Link from 'next/link';
import { PostCard } from '@/components/PostCard';
import { SetupNotice } from '@/components/SetupNotice';
import { StoryCard } from '@/components/StoryCard';
import { changelogConfig, config, FEED_ALTERNATE, formatDate, getPosts, getReleases, getStories, notion, storiesConfig } from '@/lib/blog';
import { releaseName, releasePath } from '@/lib/notion';

export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: '/', types: FEED_ALTERNATE },
};

export default async function HomePage() {
  const [posts, stories, releases] = await Promise.all([getPosts(), getStories(), getReleases()]);
  const latest = releases[0];
  return (
    <div className="container">
      <section className="hero">
        <h1>{config.siteName}</h1>
        {config.description && <p className="lede">{config.description}</p>}
      </section>
      {!notion.configured ? (
        <SetupNotice />
      ) : posts.length === 0 ? (
        <p className="empty">No posts yet. Tick Published on a post in Notion and it appears here.</p>
      ) : (
        <section aria-labelledby="latest-title">
          <div className="section-head">
            <h2 id="latest-title">Latest posts</h2>
            <Link href={config.basePath}>All posts →</Link>
          </div>
          <div className="cards">
            {posts.slice(0, 3).map((post, i) => (
              <PostCard key={post.id} post={post} headingLevel={3} priority={i === 0} />
            ))}
          </div>
        </section>
      )}
      {stories.length > 0 && (
        <section aria-labelledby="stories-title" className="home-section">
          <div className="section-head">
            <h2 id="stories-title">{storiesConfig.label}</h2>
            <Link href={storiesConfig.basePath}>All stories →</Link>
          </div>
          <div className="cards">
            {stories.slice(0, 3).map((story) => (
              <StoryCard key={story.id} story={story} headingLevel={3} />
            ))}
          </div>
        </section>
      )}
      {latest && (
        <section aria-labelledby="release-title" className="home-section">
          <div className="section-head">
            <h2 id="release-title">Latest release</h2>
            <Link href={changelogConfig.basePath}>Full changelog →</Link>
          </div>
          <p className="latest-release">
            <Link href={releasePath(changelogConfig, latest)}>{releaseName(latest)}</Link>
            <time dateTime={latest.date}>{formatDate(latest.date)}</time>
          </p>
          {latest.summary && <p className="card-excerpt">{latest.summary}</p>}
        </section>
      )}
    </div>
  );
}
