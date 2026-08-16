import Link from "next/link";
import { Card } from "@/components/ui";
import { requireCapability, venueScopeFor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS, rateUnit } from "@/lib/venueCategories";

export const dynamic = "force-dynamic";

export const metadata = { title: "Venues" };

export default async function AdminVenuesPage() {
  const user = await requireCapability("venues.view");
  const scope = await venueScopeFor(user);

  const venues = await prisma.venue.findMany({
    where: scope ? { id: { in: scope } } : {},
    orderBy: { sortOrder: "asc" },
    include: {
      rates: { where: { isActive: true } },
      operatingHours: true,
      _count: { select: { reservations: true } },
    },
  });

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl">Venues</h1>
        <p className="mt-1 text-sm text-ink-500">
          Rates, booking rules, operational buffers, approval workflow and Outlook
          calendar mapping are configured per venue.
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-4xl text-sm">
          <thead className="bg-parchment-100 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Venue</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 text-right font-medium">Rate (incl. VAT)</th>
              <th className="px-4 py-2.5 font-medium">Workflow</th>
              <th className="px-4 py-2.5 font-medium">Turnaround</th>
              <th className="px-4 py-2.5 font-medium">Payment</th>
              <th className="px-4 py-2.5 font-medium">Outlook</th>
              <th className="px-4 py-2.5 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parchment-200">
            {venues.map((venue) => {
              const rate = venue.rates[0];
              const buffer =
                venue.bufferBeforeMinutes + venue.bufferAfterMinutes === 0
                  ? "None"
                  : [
                      venue.bufferBeforeMinutes > 0 &&
                        `${venue.bufferBeforeMinutes}m before`,
                      venue.bufferAfterMinutes > 0 &&
                        `${venue.bufferAfterMinutes}m after`,
                    ]
                      .filter(Boolean)
                      .join(", ");

              return (
                <tr key={venue.id} className="hover:bg-parchment-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/venues/${venue.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {venue.name}
                    </Link>
                    <p className="text-xs text-ink-500">
                      {venue.capacity ? `${venue.capacity} capacity · ` : ""}
                      {venue._count.reservations} reservation
                      {venue._count.reservations === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {CATEGORY_LABELS[venue.category]}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="tabular">
                      {rate ? formatMoney(rate.amount) : "—"}
                    </span>
                    <p className="text-xs text-ink-500">
                      {rateUnit(venue.rateBasis)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {venue.workflow === "APPROVAL_REQUIRED" ? (
                      <span className="text-amber-800">Approval required</span>
                    ) : (
                      <span className="text-green-800">Instant</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{buffer}</td>
                  <td className="px-4 py-3 text-xs">
                    {venue.paymentPolicy === "DEPOSIT_ALLOWED"
                      ? `${venue.depositPercent}% deposit`
                      : "Full upfront"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {venue.outlookMailbox ? (
                      <span className="text-green-800">Mapped</span>
                    ) : (
                      <span className="text-ink-500">Not mapped</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {venue.isActive ? (
                      <span className="text-xs text-green-800">Bookable</span>
                    ) : (
                      <span className="text-xs text-ink-500">Hidden</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
