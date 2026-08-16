import Link from "next/link";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import { Card, StatusBadge } from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { formatCents, toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { outstandingPayments, settledTotalCents } from "@/lib/reports";
import { formatDateTime, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireCapability("bookings.view");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const in7Days = new Date(now.getTime() + 7 * 86_400_000);

  const [
    awaitingApproval,
    awaitingPayment,
    confirmedThisMonth,
    settledThisMonth,
    outstanding,
    upcoming,
    recentBookings,
    failedPayments,
  ] = await Promise.all([
    prisma.booking.count({ where: { status: BookingStatus.PENDING_APPROVAL } }),
    prisma.booking.count({ where: { status: BookingStatus.PENDING_PAYMENT } }),
    prisma.booking.count({
      where: {
        status: BookingStatus.CONFIRMED,
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    }),
    settledTotalCents({ from: monthStart, to: monthEnd }),
    outstandingPayments(),
    prisma.reservation.findMany({
      where: {
        status: { in: ["CONFIRMED", "PENDING_APPROVAL"] },
        startsAt: { gte: now, lt: in7Days },
      },
      include: { venue: true, booking: true },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { reservations: { include: { venue: true } } },
    }),
    prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
  ]);

  return (
    <>
      <h1 className="mb-6 text-2xl">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting approval"
          value={String(awaitingApproval)}
          href="/admin/bookings?status=PENDING_APPROVAL"
          tone={awaitingApproval > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Awaiting payment"
          value={String(awaitingPayment)}
          href="/admin/bookings?status=PENDING_PAYMENT"
        />
        <Stat
          label="Confirmed this month"
          value={String(confirmedThisMonth)}
          href="/admin/bookings?status=CONFIRMED"
        />
        <Stat
          label="Settled this month"
          value={formatCents(settledThisMonth)}
          href="/admin/payments"
        />
      </div>

      {(outstanding.totals.count > 0 || failedPayments > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {outstanding.totals.count > 0 && (
            <Card className="border-l-4 border-l-amber-500 p-4">
              <p className="text-sm text-ink-500">Outstanding balances</p>
              <p className="mt-1 text-xl tabular">
                {formatCents(outstanding.totals.outstandingCents)}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                across {outstanding.totals.count} booking
                {outstanding.totals.count === 1 ? "" : "s"} ·{" "}
                <Link href="/admin/reports/outstanding" className="text-brand-600 underline">
                  view report
                </Link>
              </p>
            </Card>
          )}
          {failedPayments > 0 && (
            <Card className="border-l-4 border-l-red-500 p-4">
              <p className="text-sm text-ink-500">Failed payment attempts</p>
              <p className="mt-1 text-xl tabular">{failedPayments}</p>
              <p className="mt-1 text-sm text-ink-500">
                <Link href="/admin/payments?status=FAILED" className="text-brand-600 underline">
                  review transactions
                </Link>
              </p>
            </Card>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
            Next seven days
          </h2>
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">
              No bookings scheduled in the next seven days.
            </p>
          ) : (
            <ul className="divide-y divide-parchment-200">
              {upcoming.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{r.venue.name}</p>
                    <p className="text-ink-500">
                      {formatRange(r.startsAt, r.endsAt, r.venue.timezone)}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.booking && (
                      <Link
                        href={`/admin/bookings/${r.booking.id}`}
                        className="font-mono text-xs text-brand-600 hover:underline"
                      >
                        {r.booking.reference}
                      </Link>
                    )}
                    <div className="mt-1">
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
            Recent bookings
          </h2>
          <ul className="divide-y divide-parchment-200">
            {recentBookings.map((booking) => (
              <li key={booking.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="font-mono text-brand-600 hover:underline"
                  >
                    {booking.reference}
                  </Link>
                  <p className="text-ink-500">
                    {booking.contactName} ·{" "}
                    {[...new Set(booking.reservations.map((r) => r.venue.name))].join(", ")}
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(booking.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular">
                    {formatCents(toCents(booking.total), booking.currency)}
                  </p>
                  <div className="mt-1">
                    <StatusBadge status={booking.status} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: string;
  href: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <Link
      href={href}
      className={`block border bg-white p-4 transition-colors hover:border-brand-400 ${
        tone === "warning" ? "border-amber-400" : "border-parchment-300"
      }`}
    >
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl tabular">{value}</p>
    </Link>
  );
}
