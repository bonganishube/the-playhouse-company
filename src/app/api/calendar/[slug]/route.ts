import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ReservationStatus } from "@/generated/prisma/enums";
import { feedToken } from "@/lib/calendar/feed";
import { buildIcs } from "@/lib/calendar/ics";
import { prisma } from "@/lib/prisma";

/**
 * Subscribable iCalendar feed for one venue.
 *
 * This is the integration path for an on-premises Exchange Server organisation,
 * which Microsoft Graph cannot address: Outlook subscribes to the URL and polls
 * it, so venue schedules stay current without any Entra ID app registration.
 *
 * The feed is protected by a per-venue token rather than a session, because a
 * calendar client cannot sign in. The token is derived from AUTH_SECRET, so it
 * is stable across deployments but not guessable.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";

  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true },
  });
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const expected = feedToken(venue.id);
  const provided = Buffer.from(token);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    return NextResponse.json({ error: "Invalid feed token" }, { status: 403 });
  }

  // A rolling window: recent history for context, plus everything ahead.
  const from = new Date(Date.now() - 30 * 86_400_000);
  const to = new Date(Date.now() + 400 * 86_400_000);

  const reservations = await prisma.reservation.findMany({
    where: {
      venueId: venue.id,
      status: {
        in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING_APPROVAL],
      },
      startsAt: { gte: from, lte: to },
    },
    include: { booking: true },
    orderBy: { startsAt: "asc" },
  });

  const ics = buildIcs(
    reservations.map((r) => ({
      uid: `${r.id}@playhousecompany.com`,
      summary: r.booking?.eventTitle ?? r.booking?.contactName ?? "Venue reserved",
      description: r.booking
        ? `Reference: ${r.booking.reference}\nContact: ${r.booking.contactName}`
        : undefined,
      location: venue.name,
      // The buffered block is published so operations staff see the venue as
      // occupied for the whole turnaround, not only the performance itself.
      startsAt: r.blockStartsAt,
      endsAt: r.blockEndsAt,
      createdAt: r.createdAt,
      status:
        r.status === ReservationStatus.CONFIRMED
          ? ("CONFIRMED" as const)
          : ("TENTATIVE" as const),
    })),
    `${venue.name} — The Playhouse Company`,
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
