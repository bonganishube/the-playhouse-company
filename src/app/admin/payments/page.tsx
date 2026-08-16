import Link from "next/link";
import { PaymentStatus } from "@/generated/prisma/enums";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { formatCents, toCents } from "@/lib/money";
import { configuredGateways } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Payments" };

const PAGE_SIZE = 40;

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/admin/payments">) {
  await requireCapability("payments.view");
  const query = await searchParams;

  const status = typeof query.status === "string" ? query.status : "";
  const search = typeof query.q === "string" ? query.q.trim() : "";
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const where = {
    ...(status && Object.values(PaymentStatus).includes(status as PaymentStatus)
      ? { status: status as PaymentStatus }
      : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" as const } },
            { gatewayReference: { contains: search, mode: "insensitive" as const } },
            { receiptNumber: { contains: search, mode: "insensitive" as const } },
            {
              booking: {
                is: { reference: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  const [payments, total, settledTotal] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { booking: { select: { id: true, reference: true, contactName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where: { ...where, status: PaymentStatus.SUCCEEDED },
      select: { amount: true },
    }),
  ]);

  const settledCents = settledTotal.reduce((sum, p) => sum + toCents(p.amount), 0);
  const gateways = configuredGateways();
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Payments</h1>
          <p className="mt-1 text-sm text-ink-500">
            Complete transaction record. Every gateway callback is retained against
            its payment as an audit trail.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-500">Settled (matching filter)</p>
          <p className="text-xl tabular">{formatCents(settledCents)}</p>
        </div>
      </div>

      <Card className="mb-5 p-4">
        <p className="text-sm text-ink-500">
          Configured gateways:{" "}
          {gateways.length === 0 ? (
            <span className="text-amber-800">
              none, set gateway credentials before going live
            </span>
          ) : (
            <span className="text-ink-900">
              {gateways.map((g) => g.displayName).join(", ")}
            </span>
          )}
        </p>
      </Card>

      <form className="mb-5 flex flex-wrap items-end gap-3 border border-parchment-300 bg-white p-4">
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-700">Search</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Payment, gateway or receipt reference"
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
            {Object.values(PaymentStatus).map((s) => (
              <option key={s} value={s}>
                {s}
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
        <Link href="/admin/payments" className="px-2 py-2 text-sm text-ink-500 underline">
          Reset
        </Link>
      </form>

      {payments.length === 0 ? (
        <EmptyState title="No transactions match these filters" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-4xl text-sm">
            <thead className="bg-parchment-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Booking</th>
                <th className="px-4 py-2.5 font-medium">Gateway</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">Receipt</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment-200">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-parchment-50">
                  <td className="px-4 py-2.5 tabular whitespace-nowrap">
                    {formatDateTime(payment.paidAt ?? payment.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/bookings/${payment.booking.id}`}
                      className="font-mono text-brand-600 hover:underline"
                    >
                      {payment.booking.reference}
                    </Link>
                    <p className="text-xs text-ink-500">{payment.booking.contactName}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {payment.gateway}
                    <p className="text-xs text-ink-500">{payment.purpose}</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {payment.reference}
                    {payment.gatewayReference && (
                      <p className="text-ink-500">{payment.gatewayReference}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {payment.receiptNumber ?? ", "}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {formatCents(toCents(payment.amount), payment.currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={payment.status} />
                    {payment.failureReason && (
                      <p className="mt-0.5 max-w-40 text-xs text-red-700">
                        {payment.failureReason}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          {Array.from({ length: Math.min(pages, 20) }, (_, i) => i + 1).map((p) => {
            const params = new URLSearchParams();
            if (status) params.set("status", status);
            if (search) params.set("q", search);
            params.set("page", String(p));
            return (
              <Link
                key={p}
                href={`/admin/payments?${params}`}
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
