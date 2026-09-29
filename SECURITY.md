# Security

Please report vulnerabilities privately: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue for a security problem.

A useful report says what you found, how to reproduce it and what an attacker could do with it. Include only synthetic data or redacted examples, never real credentials.

## Scope

- The core in `src/lib/notion`.
- The template routes that accept outside input: `/api/notion-webhook` and `/notion-image`.
- The scripts in `scripts/`.

Out of scope: the configuration of your own Notion workspace or hosting account.

## How the kit handles secrets

- The Notion API token is read on the server only and never sent to the browser. The site needs **Read content** and nothing more.
- Event requests require a configured secret or verification token. An unauthenticated setup handshake never invalidates data; token logging is opt-in and must be disabled after verification. Secrets are compared in constant time, and Notion's event signatures (HMAC-SHA256) are verified on the raw body.
- Image paths are signed with HMAC. Anyone with an issued URL can request that image; URLs and cached copies are not revoked by unpublishing a post. SVGs are served with a sandboxing Content-Security-Policy.
- Every push to `main` and every pull request is scanned for credentials, keys and email addresses, history included.

## Supported versions

The latest release receives fixes.
