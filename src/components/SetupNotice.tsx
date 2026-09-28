/** Shown instead of posts when no Notion token is configured in a production build. */
export function SetupNotice() {
  return (
    <section className="notice" aria-labelledby="setup-title">
      <h2 id="setup-title">Connect your Notion database</h2>
      <ol>
        <li>
          Create an internal integration at <a href="https://www.notion.so/profile/integrations">notion.so/profile/integrations</a> with
          read access only, and copy its secret.
        </li>
        <li>Open your blog database in Notion, then use the ••• menu, Connections, and add the integration.</li>
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
