import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CheckoutForm } from "@/components/CheckoutForm";
import { PageHero } from "@/components/PageHero";
import { getSession } from "@/lib/auth";
import { findCart, getCartView, groupCartLines } from "@/lib/cart";
import { formatCents, percentOfCents } from "@/lib/money";
import { activeGateway, gatewayCatalogue } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const cart = await findCart();
  const view = cart ? await getCartView(cart.id) : null;
  if (!view || view.lines.length === 0) redirect("/cart");

  const session = await getSession();

  // Grouped the same way as the cart, so the summary a customer confirms
  // matches the one they just reviewed.
  const groups = groupCartLines(view.lines);

  // A deposit is only offered when every venue in the cart permits one.
  const venues = await prisma.venue.findMany({
    where: { id: { in: view.lines.map((l) => l.venueId) } },
    select: { paymentPolicy: true, depositPercent: true },
  });
  const depositAllowed =
    venues.length > 0 && venues.every((v) => v.paymentPolicy === "DEPOSIT_ALLOWED");
  const depositPercent = Math.max(...venues.map((v) => v.depositPercent));
  const depositCents = percentOfCents(view.subtotalCents, depositPercent);

  let gatewayError: string | null = null;
  try {
    activeGateway();
  } catch (error) {
    gatewayError = error instanceof Error ? error.message : "Payment is unavailable.";
  }
  const gateways = gatewayCatalogue();

  return (
    <>
      <PageHero
        title="Checkout"
        lead="Confirm your details and complete payment to secure your booking."
      />

      <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <CheckoutForm
          signedIn={Boolean(session)}
          defaults={{
            contactName: session?.fullName ?? "",
            contactEmail: session?.email ?? "",
          }}
          deposit={
            depositAllowed
              ? {
                  percent: depositPercent,
                  totalLabel: formatCents(view.subtotalCents, view.currency),
                  amountLabel: formatCents(depositCents, view.currency),
                  balanceLabel: formatCents(
                    view.subtotalCents - depositCents,
                    view.currency,
                  ),
                }
              : null
          }
          gateways={gateways}
          gatewayError={gatewayError}
        />

        <aside>
          <div className="border border-parchment-300 bg-white">
            <h2 className="border-b border-parchment-300 px-4 py-3 text-lg">
              Your booking
            </h2>
            <div className="divide-y divide-parchment-200">
              {groups.map((group) => (
                <div key={group.key} className="px-4 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium text-ink-900">{group.venueName}</p>
                    <p className="tabular font-semibold">
                      {formatCents(group.totalCents, group.currency)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {group.rateLabel} × {group.quantityLabel}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-ink-500">
                    {group.lines.map((line) => (
                      <li key={line.id}>
                        {formatRange(line.startsAt, line.endsAt, line.timezone)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between bg-parchment-100 px-4 py-3">
              <span className="font-medium">Total</span>
              <span className="tabular text-lg font-semibold">
                {formatCents(view.subtotalCents, view.currency)}
              </span>
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-500">
            <Link href="/cart" className="underline hover:text-brand-600">
              Edit your cart
            </Link>
          </p>
        </aside>
      </div>
      </div>
    </>
  );
}
