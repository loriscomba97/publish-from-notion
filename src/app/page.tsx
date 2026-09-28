import Link from 'next/link';
import { PostCard } from '@/components/PostCard';
import { SetupNotice } from '@/components/SetupNotice';
import { config, getPosts, notion } from '@/lib/blog';

export const revalidate = 3600;

export default async function HomePage() {
  const posts = await getPosts();
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
            {posts.slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} headingLevel={3} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
