# Security

Please report vulnerabilities privately: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue for a security problem.

A useful report says what you found, how to reproduce it and what an attacker could do with it. Reports are answered as soon as possible, usually within a week.

## Scope

- The core in `src/lib/notion`.
- The template routes that accept outside input: `/api/notion-webhook` and `/notion-image`.
- The scripts in `scripts/`.

Out of scope: the configuration of your own Notion workspace or hosting account.

## How the kit handles secrets

- The Notion API token is read on the server only and never sent to the browser. The site needs **Read content** and nothing more.
- The webhook refuses every request unless its secret or verification token is configured. Secrets are compared in constant time, and Notion's event signatures (HMAC-SHA256) are verified on the raw body.
- Image URLs are signed with HMAC, so the image route cannot be used to read other files from a workspace. SVGs are served with a sandboxing Content-Security-Policy.
- Every push to `main` and every pull request is scanned for credentials, keys and email addresses, history included.

## Supported versions

The latest release receives fixes.
