import { revalidateTag } from 'next/cache';
import { handleNotionWebhook, webhookResponse } from '@/lib/notion';

/**
 * Called by Notion when a post changes: a database automation (secret in the X-Webhook-Secret
 * header) or an integration webhook (signed with the verification token). Both are rejected
 * unless the matching environment variable is set.
 */
export async function POST(request: Request) {
  const outcome = await handleNotionWebhook(request, {
    automationSecret: process.env.NOTION_AUTOMATION_SECRET,
    verificationToken: process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN,
  });
  if (outcome.ok && outcome.action === 'revalidate') {
    // The call comes from outside the app, so stale pages must never be served: expire now.
    for (const tag of outcome.tags) revalidateTag(tag, { expire: 0 });
  }
  return webhookResponse(outcome);
}
