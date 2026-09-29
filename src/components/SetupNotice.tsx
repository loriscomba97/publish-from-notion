/** Shown instead of posts when no Notion token is configured in a production build. */
export function SetupNotice() {
  return (
    <section className="notice" aria-labelledby="setup-title">
      <h2 id="setup-title">Connect your Notion database</h2>
      <ol>
        <li>
          In Notion&apos;s <a href="https://app.notion.com/developers/connections">Developer portal</a>, create an internal connection
          with Read content only, and copy its API token.
        </li>
        <li>Give it access to your blog database: in Notion, use the ••• menu, then Connections, then Add connection.</li>
        <li>
          Set <code>NOTION_TOKEN</code> and <code>NOTION_DATA_SOURCE</code> (the database link) in your environment, then redeploy.
        </li>
      </ol>
      <p>
        The full guide, including instant publishing, is in the{' '}
        <a href="https://github.com/loriscomba97/publish-from-notion#readme">README</a>.
      </p>
    </section>
  );
}
