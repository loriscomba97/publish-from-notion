# Instant publishing

Publishing is asynchronous. The checkbox controls eligibility; a webhook tells the website to refresh its cached data. The next request regenerates affected output. An already open browser tab does not update itself.

## Recommended: connection webhooks

This route was tested on a Free Notion workspace during development. It does not require a database automation. Delivery is not instantaneous or guaranteed within a fixed number of seconds.

1. Deploy the site with your read-only connection and database configured. Set `NOTION_WEBHOOK_SETUP=1` temporarily on the host and redeploy. Limit access to runtime logs.
2. In the Notion Developer portal, open the connection’s **Webhooks** tab. Create a subscription for your public HTTPS origin followed by `/api/notion-webhook`.
3. Select page content, property, creation, deletion, move and restoration events available for the connection, plus data source changes. Notion cannot deliver to localhost.
4. Notion sends a verification request. In the restricted server logs, copy the verification token from the request you just initiated into Notion’s Verify subscription dialog. The setup request itself is unauthenticated; do not trust an unrelated log entry.
5. Store that token as `NOTION_WEBHOOK_VERIFICATION_TOKEN`, remove `NOTION_WEBHOOK_SETUP`, and redeploy. Subsequent events require a valid HMAC signature. Never paste tokens into issues or screenshots.
6. Edit a demo post and wait for delivery, then reload it. Also test unpublishing: the post should disappear from the index, sitemap and feed, and its route should return 404. Republish and check again.

[Notion’s webhook setup](https://developers.notion.com/reference/webhooks) and [delivery reference](https://developers.notion.com/reference/webhooks-events-delivery) describe verification, aggregation and retries. Allow for delivery delays; do not present an accelerated demo as real-time footage.

## Optional: database automation

Notion’s **Send webhook** automation action requires a paid plan. It responds to configured property changes; it does not replace content-change events. [Notion’s automation reference](https://www.notion.com/help/webhook-actions).

1. Generate a random secret, for example `openssl rand -hex 32`. Set it as `NOTION_AUTOMATION_SECRET` on the host and redeploy.
2. Create an automation triggered when `Published` is edited, including both checked and unchecked states.
3. Add Send webhook to the same `/api/notion-webhook` endpoint. Add custom header `X-Webhook-Secret` with the generated secret. Never put it in the URL.
4. Test publishing and unpublishing. Measure your deployment before making a speed claim.

You may use both paths. Their secrets are different: the automation secret is yours; the verification token comes from Notion.

## Cache and hosting

Page events invalidate the post list and the named page’s data. Data source/database events, or an authenticated automation payload without a usable page ID, invalidate the broader Notion cache. It is not always exactly two tags or two API calls: pagination and nested blocks require additional requests.

The one-hour revalidation interval is a request-driven fallback, not a scheduled sync. A visit after expiry can trigger regeneration and may initially see stale content. No visitor traffic means no guarantee of a refresh at a particular time.

Self-hosted replicas need a shared cache and compatible invalidation. Use a Node.js server, not a static export. Do not put a browser challenge or login wall in front of the webhook endpoint; retain the endpoint’s own authentication.

## Images and withdrawal

Image paths are signed, not encrypted, and identify the source content. On a cache miss the proxy gets a fresh file URL from Notion and serves the image. It accepts configured Notion file hosts, rejects upstream redirects and sandboxes SVGs. The URL does not expire merely because Notion’s temporary URL does, but service availability and signing keys still matter.

Responses allow one year of public caching. Unpublishing an article does not revoke previously issued image URLs or erase readers’ copies. For a takedown, remove the source file, purge host/CDN caches and consider rotating the image key; already downloaded copies remain outside the kit’s control. Do not use this template for confidential or access-restricted media.

[Back to README](../README.md)
