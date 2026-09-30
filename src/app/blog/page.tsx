import type { Metadata } from 'next';
import { JsonLd } from '@/components/JsonLd';
import { PostCard } from '@/components/PostCard';
import { SetupNotice } from '@/components/SetupNotice';
import { config, FEED_ALTERNATE, getPosts, notion, SHARE_IMAGE } from '@/lib/blog';
import { blogJsonLd } from '@/lib/notion';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Blog',
  description: config.description,
  alternates: { canonical: config.basePath, types: FEED_ALTERNATE },
  openGraph: { type: 'website', url: config.basePath, title: `Blog | ${config.siteName}`, description: config.description, siteName: config.siteName, images: [SHARE_IMAGE] },
};

export default async function BlogPage() {
  const posts = await getPosts();
  return (
    <div className="container">
      <JsonLd data={blogJsonLd(config, posts, { description: config.description })} />
      <header className="page-head">
        <h1>Blog</h1>
        {config.description && <p className="lede">{config.description}</p>}
      </header>
      {!notion.configured ? (
        <SetupNotice />
      ) : posts.length === 0 ? (
        <p className="empty">No posts yet. Tick Published on a post in Notion and it appears here.</p>
      ) : (
        <div className="cards cards-feature">
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} priority={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
