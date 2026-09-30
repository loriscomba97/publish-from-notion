import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHANGELOG_FEED_ALTERNATE, CHANGELOG_ON, changelogConfig, formatDate, getReleaseEntries, SHARE_IMAGE } from '@/lib/blog';
import { releaseName } from '@/lib/notion';

export const revalidate = 3600;

const description = `New features, improvements and fixes in ${changelogConfig.siteName}, newest first.`;

export const metadata: Metadata = {
  title: changelogConfig.label,
  description,
  alternates: { canonical: changelogConfig.basePath, types: CHANGELOG_FEED_ALTERNATE },
  openGraph: { type: 'website', url: changelogConfig.basePath, title: `${changelogConfig.label} | ${changelogConfig.siteName}`, description, siteName: changelogConfig.siteName, images: [SHARE_IMAGE] },
};

export default async function ChangelogPage() {
  if (!CHANGELOG_ON) notFound();
  const entries = await getReleaseEntries();
  return (
    <div className="container changelog">
      <header className="page-head">
        <h1>{changelogConfig.label}</h1>
        <p className="lede">{description}</p>
        <p className="subscribe">
          <a href={`${changelogConfig.basePath}/feed.xml`}>Follow releases with RSS</a>
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="empty">No releases yet. Tick Published on a release in Notion and it appears here.</p>
      ) : (
        <ol className="releases">
          {entries.map(({ release, notes }) => (
            <li key={release.id} id={release.anchor} className="release">
              <div className="release-meta">
                <time dateTime={release.date}>{formatDate(release.date)}</time>
                {release.product && <span className="tag">{release.product}</span>}
              </div>
              <div className="release-body">
                <h2>
                  <a href={`#${release.anchor}`}>{releaseName(release)}</a>
                </h2>
                {release.summary && <p className="release-summary">{release.summary}</p>}
                {release.sections.map((section) => (
                  <section key={section.label} className="release-section">
                    <h3>{section.label}</h3>
                    <ul>
                      {section.items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
                {notes && <div className="prose release-notes" dangerouslySetInnerHTML={{ __html: notes.html }} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
