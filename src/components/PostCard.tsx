import Link from 'next/link';
import { config, coverAltText, coverUrl, formatDate } from '@/lib/blog';
import type { Post } from '@/lib/notion';

export async function PostCard({ post, headingLevel = 2 }: { post: Post; headingLevel?: 2 | 3 }) {
  const cover = await coverUrl(post);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className="card">
      <Link href={`${config.basePath}/${post.slug}`} className="card-link">
        <div className="card-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover ? <img src={cover} alt={coverAltText(post)} loading="lazy" decoding="async" /> : <span aria-hidden="true" />}
        </div>
        <div className="card-body">
          <p className="eyebrow">
            {post.category && <span>{post.category}</span>}
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          </p>
          <Heading className="card-title">{post.title}</Heading>
          {post.excerpt && <p className="card-excerpt">{post.excerpt}</p>}
        </div>
      </Link>
    </article>
  );
}
