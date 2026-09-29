import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { StoryCard } from '@/components/StoryCard';
import { FEED_ALTERNATE, getStories, STORIES_ON, storiesConfig } from '@/lib/blog';
import { blogJsonLd } from '@/lib/notion';

export const revalidate = 3600;

const description = `How teams use ${storiesConfig.siteName}, in their own words.`;

export const metadata: Metadata = {
  title: storiesConfig.label,
  description,
  alternates: { canonical: storiesConfig.basePath, types: FEED_ALTERNATE },
  openGraph: { type: 'website', url: storiesConfig.basePath, title: `${storiesConfig.label} | ${storiesConfig.siteName}`, description, siteName: storiesConfig.siteName },
};

export default async function StoriesPage() {
  if (!STORIES_ON) notFound();
  const stories = await getStories();
  return (
    <div className="container">
      <JsonLd data={blogJsonLd(storiesConfig, stories, { description })} />
      <header className="page-head">
        <h1>{storiesConfig.label}</h1>
        <p className="lede">{description}</p>
      </header>
      {stories.length === 0 ? (
        <p className="empty">No stories yet. Tick Published on a story in Notion and it appears here.</p>
      ) : (
        <div className="cards cards-feature">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}
