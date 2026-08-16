import Link from "next/link";
import { ReservationStatus } from "@/generated/prisma/enums";
import { Card } from "@/components/ui";
import { requireCapability, venueScopeFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TZ, DateTime, formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Booking calendar" };

type View = "day" | "week" | "month";

const OCCUPYING: ReservationStatus[] = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.PENDING_APPROVAL,
  ReservationStatus.PENDING_PAYMENT,
];

export default async function CalendarPage({
  searchParams,
}: PageProps<"/admin/calendar">) {
  const user = await requireCapability("bookings.view");
  const scope = await venueScopeFor(user);
  const query = await searchParams;

  const view: View = (["day", "week", "month"] as const).includes(
    query.view as View,
  )
    ? (query.view as View)
    : "week";

  const anchor = DateTime.fromISO(
    typeof query.date === "string" && query.date
      ? query.date
      : DateTime.now().setZone(DEFAULT_TZ).toISODate()!,
    { zone: DEFAULT_TZ },
  );

  const venueFilter = typeof query.venue === "string" ? query.venue : "";

  const { start, end, label } = rangeFor(view, anchor);

  const venues = await prisma.venue.findMany({
    where: scope ? { id: { in: scope } } : {},
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, timezone: true },
  });

  const reservations = await prisma.reservation.findMany({
    where: {
      status: { in: OCCUPYING },
      startsAt: { lt: end.toJSDate() },
      endsAt: { gt: start.toJSDate() },
      ...(venueFilter ? { venueId: venueFilter } : {}),
      ...(scope ? { venueId: { in: scope } } : {}),
    },
    include: {
      venue: { select: { id: true, name: true, timezone: true } },
      booking: { select: { id: true, reference: true, contactName: true, eventTitle: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const exportParams = new URLSearchParams({
    from: start.toISODate()!,
    to: end.toISODate()!,
  });
  if (venueFilter) exportParams.set("venue", venueFilter);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Booking calendar</h1>
          <p className="mt-1 text-sm text-ink-500">{label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex border border-parchment-300 bg-white">
            {(["day", "week", "month"] as const).map((v) => (
              <Link
                key={v}
                href={buildUrl({ view: v, date: anchor.toISODate()!, venue: venueFilter })}
                className={`px-3 py-1.5 text-sm capitalize ${
                  v === view ? "bg-brand-600 text-white" : "hover:bg-parchment-100"
                }`}
              >
                {v}
              </Link>
            ))}
          </div>

          <Link
            href={`/api/admin/schedule/export?${exportParams}`}
            className="border border-parchment-300 bg-white px-3 py-1.5 text-sm hover:bg-parchment-100"
          >
            Export CSV
          </Link>
          <Link
            href={`/api/admin/schedule/export?${exportParams}&format=ics`}
            className="border border-parchment-300 bg-white px-3 py-1.5 text-sm hover:bg-parchment-100"
          >
            Export calendar
          </Link>
        </div>
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-3 border border-parchment-300 bg-white p-4 no-print">
        <input type="hidden" name="view" value={view} />
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-700">Date</span>
          <input
            type="date"
            name="date"
            defaultValue={anchor.toISODate()!}
            className="border border-parchment-300 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-700">Venue</span>
          <select
            name="venue"
            defaultValue={venueFilter}
            className="border border-parchment-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          Go
        </button>

        <div className="ml-auto flex gap-2">
          <Link
            href={buildUrl({
              view,
              date: shift(view, anchor, -1).toISODate()!,
              venue: venueFilter,
            })}
            className="border border-parchment-300 px-3 py-2 text-sm hover:bg-parchment-100"
          >
            ← Previous
          </Link>
          <Link
            href={buildUrl({
              view,
              date: DateTime.now().setZone(DEFAULT_TZ).toISODate()!,
              venue: venueFilter,
            })}
            className="border border-parchment-300 px-3 py-2 text-sm hover:bg-parchment-100"
          >
            Today
          </Link>
          <Link
            href={buildUrl({
              view,
              date: shift(view, anchor, 1).toISODate()!,
              venue: venueFilter,
            })}
            className="border border-parchment-300 px-3 py-2 text-sm hover:bg-parchment-100"
          >
            Next →
          </Link>
        </div>
      </form>

      {view === "day" && (
        <DayView reservations={reservations} venues={venues} date={anchor} />
      )}
      {view === "week" && <WeekView reservations={reservations} start={start} />}
      {view === "month" && (
        <MonthView reservations={reservations} anchor={anchor} start={start} end={end} />
      )}

      {reservations.length === 0 && (
        <p className="mt-6 text-center text-sm text-ink-500">
          No bookings fall within this period.
        </p>
      )}
    </>
  );
}

type Res = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus;
  venue: { id: string; name: string; timezone: string };
  booking: {
    id: string;
    reference: string;
    contactName: string;
    eventTitle: string | null;
  } | null;
};

function Entry({ r, compact = false }: { r: Res; compact?: boolean }) {
  const tone =
    r.status === ReservationStatus.CONFIRMED
      ? "border-l-green-600 bg-green-50"
      : r.status === ReservationStatus.PENDING_APPROVAL
        ? "border-l-amber-500 bg-amber-50"
        : "border-l-blue-500 bg-blue-50";

  return (
    <Link
      href={r.booking ? `/admin/bookings/${r.booking.id}` : "#"}
      className={`block border-l-4 px-2 py-1 text-xs hover:brightness-95 ${tone}`}
    >
      <span className="block tabular text-ink-900">
        {formatTime(r.startsAt, r.venue.timezone)}–{formatTime(r.endsAt, r.venue.timezone)}
      </span>
      {!compact && <span className="block font-medium">{r.venue.name}</span>}
      <span className="block truncate text-ink-500">
        {r.booking?.eventTitle ?? r.booking?.contactName ?? "Reserved"}
      </span>
    </Link>
  );
}

function DayView({
  reservations,
  venues,
  date,
}: {
  reservations: Res[];
  venues: { id: string; name: string }[];
  date: DateTime;
}) {
  const shown = venues.filter((v) =>
    reservations.some((r) => r.venue.id === v.id),
  );
  const columns = shown.length ? shown : venues;

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-3xl text-sm">
        <thead className="bg-parchment-100 text-left text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th className="w-24 px-3 py-2 font-medium">Venue</th>
            <th className="px-3 py-2 font-medium">
              {date.toFormat("cccc d LLLL yyyy")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-parchment-200">
          {columns.map((venue) => {
            const items = reservations.filter((r) => r.venue.id === venue.id);
            return (
              <tr key={venue.id}>
                <th className="w-24 px-3 py-3 text-left align-top font-medium">
                  {venue.name}
                </th>
                <td className="px-3 py-3">
                  {items.length === 0 ? (
                    <span className="text-xs text-ink-500">Available all day</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {items.map((r) => (
                        <div key={r.id} className="w-56">
                          <Entry r={r} compact />
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function WeekView({ reservations, start }: { reservations: Res[]; start: DateTime }) {
  const days = Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));

  return (
    <Card className="overflow-x-auto">
      <div className="grid min-w-4xl grid-cols-7 divide-x divide-parchment-200">
        {days.map((day) => {
          const iso = day.toISODate()!;
          const items = reservations.filter(
            (r) =>
              DateTime.fromJSDate(r.startsAt, { zone: r.venue.timezone }).toISODate() ===
              iso,
          );
          const isToday = iso === DateTime.now().setZone(DEFAULT_TZ).toISODate();

          return (
            <div key={iso} className="min-h-48">
              <div
                className={`border-b border-parchment-200 px-2 py-2 text-center text-xs ${
                  isToday ? "bg-brand-600 text-white" : "bg-parchment-100 text-ink-500"
                }`}
              >
                <span className="block uppercase tracking-wide">
                  {day.toFormat("ccc")}
                </span>
                <span className="block text-lg tabular">{day.toFormat("d")}</span>
              </div>
              <div className="space-y-1 p-1.5">
                {items.map((r) => (
                  <Entry key={r.id} r={r} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MonthView({
  reservations,
  anchor,
  start,
  end,
}: {
  reservations: Res[];
  anchor: DateTime;
  start: DateTime;
  end: DateTime;
}) {
  // Pad to whole weeks so the grid always reads as a calendar month.
  const gridStart = start.startOf("week");
  const gridEnd = end.minus({ days: 1 }).endOf("week");
  const dayCount = Math.ceil(gridEnd.diff(gridStart, "days").days) + 1;
  const days = Array.from({ length: dayCount }, (_, i) => gridStart.plus({ days: i }));

  return (
    <Card className="overflow-x-auto">
      <div className="grid min-w-3xl grid-cols-7 bg-parchment-100 text-center text-xs uppercase tracking-wide text-ink-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b border-parchment-200 px-2 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-w-3xl grid-cols-7 divide-x divide-y divide-parchment-200">
        {days.map((day) => {
          const iso = day.toISODate()!;
          const items = reservations.filter(
            (r) =>
              DateTime.fromJSDate(r.startsAt, { zone: r.venue.timezone }).toISODate() ===
              iso,
          );
          const inMonth = day.month === anchor.month;
          const isToday = iso === DateTime.now().setZone(DEFAULT_TZ).toISODate();

          return (
            <div
              key={iso}
              className={`min-h-24 p-1 ${inMonth ? "bg-white" : "bg-parchment-50 text-ink-500/50"}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center text-xs tabular ${
                    isToday ? "rounded-full bg-brand-600 text-white" : ""
                  }`}
                >
                  {day.toFormat("d")}
                </span>
                {items.length > 0 && (
                  <span className="text-[10px] text-ink-500">{items.length}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((r) => (
                  <Link
                    key={r.id}
                    href={r.booking ? `/admin/bookings/${r.booking.id}` : "#"}
                    className="block truncate rounded-sm bg-brand-50 px-1 py-0.5 text-[10px] text-brand-800 hover:bg-brand-100"
                    title={`${r.venue.name}, ${r.booking?.reference ?? ""}`}
                  >
                    {formatTime(r.startsAt, r.venue.timezone)} {r.venue.name}
                  </Link>
                ))}
                {items.length > 3 && (
                  <Link
                    href={buildUrl({ view: "day", date: iso, venue: "" })}
                    className="block text-[10px] text-ink-500 underline"
                  >
                    +{items.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

function rangeFor(view: View, anchor: DateTime) {
  switch (view) {
    case "day":
      return {
        start: anchor.startOf("day"),
        end: anchor.startOf("day").plus({ days: 1 }),
        label: anchor.toFormat("cccc d LLLL yyyy"),
      };
    case "month": {
      const start = anchor.startOf("month");
      const end = start.plus({ months: 1 });
      return { start, end, label: anchor.toFormat("LLLL yyyy") };
    }
    case "week":
    default: {
      const start = anchor.startOf("week");
      const end = start.plus({ weeks: 1 });
      return {
        start,
        end,
        label: `${start.toFormat("d LLL")} – ${end.minus({ days: 1 }).toFormat("d LLL yyyy")}`,
      };
    }
  }
}

function shift(view: View, anchor: DateTime, direction: number): DateTime {
  if (view === "day") return anchor.plus({ days: direction });
  if (view === "month") return anchor.plus({ months: direction });
  return anchor.plus({ weeks: direction });
}

function buildUrl(options: { view: View; date: string; venue: string }): string {
  const params = new URLSearchParams({ view: options.view, date: options.date });
  if (options.venue) params.set("venue", options.venue);
  return `/admin/calendar?${params}`;
}
