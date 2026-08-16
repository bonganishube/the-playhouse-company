/**
 * iCalendar (RFC 5545) generation.
 *
 * Serves two purposes:
 *   - a .ics attachment on booking confirmations, so a customer can add the
 *     booking to any calendar application;
 *   - a subscribable venue feed, which is how an on-premises Exchange Server
 *     organisation (outside Microsoft Graph's reach) consumes venue schedules.
 */

export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  createdAt?: Date;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
};

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape per RFC 5545 §3.3.11. */
function escape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets, as required by the specification. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 74) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  if (remaining) parts.push(` ${remaining}`);
  return parts.join("\r\n");
}

export function buildIcs(
  events: IcsEvent[],
  calendarName = "The Playhouse Company",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Playhouse Company//Venue Booking Platform//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(calendarName)}`,
    "X-WR-TIMEZONE:Africa/Johannesburg",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(event.createdAt ?? new Date())}`,
      `DTSTART:${stamp(event.startsAt)}`,
      `DTEND:${stamp(event.endsAt)}`,
      `SUMMARY:${escape(event.summary)}`,
      `STATUS:${event.status ?? "CONFIRMED"}`,
      "TRANSP:OPAQUE",
    );
    if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
