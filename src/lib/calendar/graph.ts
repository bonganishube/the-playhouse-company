import { env, outlookConfigured } from "../env";

/**
 * Microsoft Graph client (application permissions).
 *
 * Supported environments: Microsoft 365 Enterprise and Exchange Online. A
 * hybrid tenant whose mailboxes are still on-premises is reached through the
 * same API provided Exchange hybrid modern authentication is in place; a
 * purely on-premises Exchange organisation is not addressable by Graph and is
 * served instead by the ICS feed in ./ics.ts.
 *
 * Azure AD / Microsoft Entra ID app registration required:
 *   - Application permission: Calendars.ReadWrite  (admin consent required)
 *   - A client secret or certificate
 *   - Recommended: an application access policy restricting the registration
 *     to the venue resource mailboxes only, so the platform cannot read the
 *     wider organisation's calendars.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

type CachedToken = { token: string; expiresAt: number };
let cached: CachedToken | null = null;

export class GraphNotConfiguredError extends Error {
  constructor() {
    super("Microsoft Graph is not configured");
    this.name = "GraphNotConfiguredError";
  }
}

async function accessToken(): Promise<string> {
  if (!outlookConfigured()) throw new GraphNotConfiguredError();

  // Reuse the cached token until a minute before it lapses.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const url = `https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Entra ID token request failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}

async function graphFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await accessToken();
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export type GraphEvent = {
  subject: string;
  body: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  location: string;
  /** Written to the event so a booking can be traced back from Outlook. */
  bookingReference: string;
};

/** Create an event on a venue's calendar. Returns the Graph event id. */
export async function createEvent(
  mailbox: string,
  calendarId: string | null,
  event: GraphEvent,
): Promise<string> {
  const path = calendarId
    ? `/users/${encodeURIComponent(mailbox)}/calendars/${calendarId}/events`
    : `/users/${encodeURIComponent(mailbox)}/calendar/events`;

  const response = await graphFetch(path, {
    method: "POST",
    body: JSON.stringify({
      subject: event.subject,
      body: { contentType: "HTML", content: event.body },
      start: {
        dateTime: toGraphDateTime(event.startsAt, event.timezone),
        timeZone: event.timezone,
      },
      end: {
        dateTime: toGraphDateTime(event.endsAt, event.timezone),
        timeZone: event.timezone,
      },
      location: { displayName: event.location },
      // Blocks the resource so Outlook users see the venue as busy.
      showAs: "busy",
      isReminderOn: true,
      reminderMinutesBeforeStart: 60,
      singleValueExtendedProperties: [
        {
          id: "String {6a2d1b0e-6b9a-4a5b-9d4e-1f0a2b3c4d5e} Name BookingReference",
          value: event.bookingReference,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Graph event creation failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

export async function deleteEvent(
  mailbox: string,
  eventId: string,
): Promise<void> {
  const response = await graphFetch(
    `/users/${encodeURIComponent(mailbox)}/events/${eventId}`,
    { method: "DELETE" },
  );
  // 404 means it is already gone, which satisfies the intent.
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Graph event deletion failed (${response.status}): ${await response.text()}`,
    );
  }
}

/**
 * Confirm the app registration works and the mailbox is reachable, surfaced
 * as a connection test in the admin console.
 */
export async function testConnection(
  mailbox: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await graphFetch(
      `/users/${encodeURIComponent(mailbox)}/calendar`,
    );
    if (response.ok) {
      const data = (await response.json()) as { name?: string };
      return { ok: true, message: `Connected to calendar "${data.name ?? mailbox}".` };
    }
    return {
      ok: false,
      message: `Graph responded ${response.status}: ${await response.text()}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Graph expects a local date-time string paired with a named time zone. */
function toGraphDateTime(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
