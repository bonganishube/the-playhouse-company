import { createHmac } from "node:crypto";
import { env } from "../env";

/**
 * Stable, unguessable subscription token for a venue's iCalendar feed.
 *
 * Derived from AUTH_SECRET rather than stored, so it survives redeployment
 * without a migration but cannot be guessed from the venue identifier.
 * Rotating AUTH_SECRET invalidates every feed URL, which is the intended
 * revocation mechanism.
 */
export function feedToken(venueId: string): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`calendar-feed:${venueId}`)
    .digest("hex")
    .slice(0, 32);
}

export function feedUrl(slug: string, venueId: string): string {
  return `${env.APP_URL}/api/calendar/${slug}?token=${feedToken(venueId)}`;
}
