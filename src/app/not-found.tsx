import Link from 'next/link';
import { config } from '@/lib/blog';

export default function NotFound() {
  return (
    <div className="container narrow">
      <header className="page-head">
        <p className="eyebrow">404</p>
        <h1>This page does not exist</h1>
        <p className="lede">It may have been unpublished, or the link has a typo.</p>
      </header>
      <p>
        <Link href={config.basePath}>Browse all posts →</Link>
      </p>
    </div>
  );
}
