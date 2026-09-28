import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { config, DEMO, FEED_ALTERNATE, INDEXABLE } from '@/lib/blog';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: config.siteName, template: `%s | ${config.siteName}` },
  description: config.description,
  alternates: { types: FEED_ALTERNATE },
  openGraph: { type: 'website', siteName: config.siteName, url: config.siteUrl },
  robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {DEMO && (
          <p className="demo-banner">
            Demo content. Connect your Notion database to publish your own posts:{' '}
            <a href="https://github.com/loriscomba97/publish-from-notion#connect-notion">setup guide</a>.
          </p>
        )}
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              {config.siteName}
            </Link>
            <nav aria-label="Main">
              <Link href={config.basePath}>Blog</Link>
              <a href={`${config.basePath}/feed.xml`}>RSS</a>
            </nav>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <p>
              Written in Notion, published with <a href="https://github.com/loriscomba97/publish-from-notion">publish-from-notion</a>.
            </p>
            <p>
              <a href={`${config.basePath}/feed.xml`}>RSS</a> · <a href="/sitemap.xml">Sitemap</a> · <a href="/llms.txt">llms.txt</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
