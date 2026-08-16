import { NextResponse } from "next/server";
import { ReservationStatus } from "@/generated/prisma/enums";
import { AuthorisationError, requireCapability, venueScopeFor } from "@/lib/auth";
import { buildIcs } from "@/lib/calendar/ics";
import { toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/reports";
import { formatDate, formatTime } from "@/lib/time";

/**
 * Schedule export for authorised staff, as CSV for spreadsheet use or as an
 * iCalendar file that can be imported into Outlook, Google Calendar or any
 * other client — including an on-premises Exchange organisation that Microsoft
 * Graph cannot reach.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireCapability("schedule.export");
  } catch (error) {
    const status = error instanceof AuthorisationError ? error.status : 403;
    return NextResponse.json({ error: "Not permitted" }, { status });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const venueId = params.get("venue");
  const format = params.get("format") === "ics" ? "ics" : "csv";

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to date parameters are required" },
      { status: 400 },
    );
  }

  const scope = await venueScopeFor(user);

  const reservations = await prisma.reservation.findMany({
    where: {
      startsAt: { gte: new Date(`${from}T00:00:00Z`) },
      endsAt: { lte: new Date(`${to}T23:59:59Z`) },
      status: {
        in: [
          ReservationStatus.CONFIRMED,
          ReservationStatus.PENDING_APPROVAL,
          ReservationStatus.PENDING_PAYMENT,
        ],
      },
      ...(venueId ? { venueId } : {}),
      ...(scope ? { venueId: { in: scope } } : {}),
    },
    include: {
      venue: true,
      booking: true,
    },
    orderBy: { startsAt: "asc" },
  });

  if (format === "ics") {
    const ics = buildIcs(
      reservations.map((r) => ({
        uid: `${r.id}@playhousecompany.com`,
        summary: `${r.venue.name} — ${r.booking?.eventTitle ?? r.booking?.contactName ?? "Reserved"}`,
        description: [
          r.booking ? `Reference: ${r.booking.reference}` : null,
          r.booking ? `Contact: ${r.booking.contactName} (${r.booking.contactEmail})` : null,
          `Status: ${r.status}`,
        ]
          .filter(Boolean)
          .join("\n"),
        location: r.venue.name,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        createdAt: r.createdAt,
        status:
          r.status === ReservationStatus.CONFIRMED
            ? ("CONFIRMED" as const)
            : ("TENTATIVE" as const),
      })),
      `Playhouse schedule ${from} to ${to}`,
    );

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="playhouse-schedule-${from}-to-${to}.ics"`,
      },
    });
  }

  const csv = toCsv(
    reservations.map((r) => ({
      date: formatDate(r.startsAt, r.venue.timezone),
      venue: r.venue.name,
      start: formatTime(r.startsAt, r.venue.timezone),
      end: formatTime(r.endsAt, r.venue.timezone),
      blockStart: formatTime(r.blockStartsAt, r.venue.timezone),
      blockEnd: formatTime(r.blockEndsAt, r.venue.timezone),
      reference: r.booking?.reference ?? "",
      event: r.booking?.eventTitle ?? "",
      customer: r.booking?.contactName ?? "",
      email: r.booking?.contactEmail ?? "",
      phone: r.booking?.contactPhone ?? "",
      status: r.status,
      value: (toCents(r.lineTotal) / 100).toFixed(2),
    })),
    [
      { key: "date", label: "Date" },
      { key: "venue", label: "Venue" },
      { key: "start", label: "Start" },
      { key: "end", label: "End" },
      { key: "blockStart", label: "Held from (incl. turnaround)" },
      { key: "blockEnd", label: "Held until (incl. turnaround)" },
      { key: "reference", label: "Booking reference" },
      { key: "event", label: "Event" },
      { key: "customer", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Telephone" },
      { key: "status", label: "Status" },
      { key: "value", label: "Value (ZAR)" },
    ],
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="playhouse-schedule-${from}-to-${to}.csv"`,
    },
  });
}
