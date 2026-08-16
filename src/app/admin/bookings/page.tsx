import Link from "next/link";
import { BookingStatus } from "@/generated/prisma/enums";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { requireCapability, venueScopeFor } from "@/lib/auth";
import { formatCents, toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatDate, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bookings" };

const PAGE_SIZE = 25;

export default async function AdminBookingsPage({
  searchParams,
}: PageProps<"/admin/bookings">) {
  const user = await requireCapability("bookings.view");
  const scope = await venueScopeFor(user);
  const query = await searchParams;

  const status = typeof query.status === "string" ? query.status : "";
  const venueId = typeof query.venue === "string" ? query.venue : "";
  const search = typeof query.q === "string" ? query.q.trim() : "";
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const where = {
    ...(status && Object.values(BookingStatus).includes(status as BookingStatus)
      ? { status: status as BookingStatus }
      : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" as const } },
            { contactName: { contains: search, mode: "insensitive" as const } },
            { contactEmail: { contains: search, mode: "insensitive" as const } },
            { organisation: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    // Venue managers only see bookings touching their venues.
    ...(venueId || scope
      ? {
          reservations: {
            some: {
              ...(venueId ? { venueId } : {}),
              ...(scope ? { venueId: { in: scope } } : {}),
            },
          },
        }
      : {}),
  };

  const [bookings, total, venues] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        reservations: { include: { venue: true }, orderBy: { startsAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.booking.count({ where }),
    prisma.venue.findMany({
      where: scope ? { id: { in: scope } } : {},
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl">Bookings</h1>
        <p className="text-sm text-ink-500">
          {total} booking{total === 1 ? "" : "s"}
        </p>
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-3 border border-parchment-300 bg-white p-4">
        <label className="flex-1 min-w-48">
          <span className="mb-1 block text-xs font-medium text-ink-700">Search</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Reference, name, email or organisation"
            className="w-full border border-parchment-300 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-700">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="border border-parchment-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {Object.values(BookingStatus).map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-700">Venue</span>
          <select
            name="venue"
            defaultValue={venueId}
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
          Filter
        </button>
        <Link href="/admin/bookings" className="px-2 py-2 text-sm text-ink-500 underline">
          Reset
        </Link>
      </form>

      {bookings.length === 0 ? (
        <EmptyState title="No bookings match these filters" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-4xl text-sm">
            <thead className="bg-parchment-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Venue &amp; dates</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment-200">
              {bookings.map((booking) => {
                const outstanding =
                  toCents(booking.total) - toCents(booking.amountPaid);
                return (
                  <tr key={booking.id} className="hover:bg-parchment-50">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/admin/bookings/${booking.id}`}
                        className="font-mono text-brand-600 hover:underline"
                      >
                        {booking.reference}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {formatDate(booking.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p>{booking.contactName}</p>
                      <p className="text-xs text-ink-500">{booking.contactEmail}</p>
                      {booking.organisation && (
                        <p className="text-xs text-ink-500">{booking.organisation}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {booking.reservations.map((r) => (
                        <p key={r.id} className="text-xs">
                          <span className="text-ink-900">{r.venue.name}</span>
                          <span className="text-ink-500">
                            {", "}
                            {formatRange(r.startsAt, r.endsAt, r.venue.timezone)}
                          </span>
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular">
                      {formatCents(toCents(booking.total), booking.currency)}
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular">
                      {outstanding > 0 ? (
                        <span className="font-medium text-brand-700">
                          {formatCents(outstanding, booking.currency)}
                        </span>
                      ) : (
                        <span className="text-ink-500">, </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={booking.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            if (status) params.set("status", status);
            if (venueId) params.set("venue", venueId);
            if (search) params.set("q", search);
            params.set("page", String(p));
            return (
              <Link
                key={p}
                href={`/admin/bookings?${params}`}
                className={`border px-3 py-1.5 ${
                  p === page
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-parchment-300 bg-white hover:bg-parchment-100"
                }`}
              >
                {p}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
