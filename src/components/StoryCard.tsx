import Link from 'next/link';
import { coverAltText, coverUrl, imageUrl, storiesConfig } from '@/lib/blog';
import type { Post } from '@/lib/notion';

/** A customer story in a grid: cover, company, title, the pull quote and who said it. */
export async function StoryCard({ story, headingLevel = 2 }: { story: Post; headingLevel?: 2 | 3 }) {
  const [cover, avatar] = await Promise.all([coverUrl(story), imageUrl(story.images.avatar)]);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const { customer, role, company, quote } = story.extra;
  return (
    <article className="card story-card">
      <Link href={`${storiesConfig.basePath}/${story.slug}`} className="card-link">
        <div className="card-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover ? <img src={cover} alt={coverAltText(story)} loading="lazy" decoding="async" /> : <span aria-hidden="true" />}
        </div>
        <div className="card-body">
          <p className="eyebrow">
            {company && <span>{company}</span>}
            {story.featured && <em className="featured">Featured</em>}
          </p>
          <Heading className="card-title">{story.title}</Heading>
          {quote && <p className="card-quote">“{quote}”</p>}
          {customer && (
            <p className="person">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar && <img src={avatar} alt="" width={36} height={36} loading="lazy" decoding="async" />}
              <span>
                <strong>{customer}</strong>
                {role && <>, {role}</>}
              </span>
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
