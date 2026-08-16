import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CheckoutForm } from "@/components/CheckoutForm";
import { PageHero } from "@/components/PageHero";
import { getSession } from "@/lib/auth";
import { findCart, getCartView } from "@/lib/cart";
import { formatCents, percentOfCents } from "@/lib/money";
import { activeGateway } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const cart = await findCart();
  const view = cart ? await getCartView(cart.id) : null;
  if (!view || view.lines.length === 0) redirect("/cart");

  const session = await getSession();

  // A deposit is only offered when every venue in the cart permits one.
  const venues = await prisma.venue.findMany({
    where: { id: { in: view.lines.map((l) => l.venueId) } },
    select: { paymentPolicy: true, depositPercent: true },
  });
  const depositAllowed =
    venues.length > 0 && venues.every((v) => v.paymentPolicy === "DEPOSIT_ALLOWED");
  const depositPercent = Math.max(...venues.map((v) => v.depositPercent));
  const depositCents = percentOfCents(view.subtotalCents, depositPercent);

  let gatewayName: string | null = null;
  let gatewayError: string | null = null;
  try {
    gatewayName = activeGateway().displayName;
  } catch (error) {
    gatewayError = error instanceof Error ? error.message : "Payment is unavailable.";
  }

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
                  amountLabel: formatCents(depositCents, view.currency),
                  balanceLabel: formatCents(
                    view.subtotalCents - depositCents,
                    view.currency,
                  ),
                }
              : null
          }
          gatewayName={gatewayName}
          gatewayError={gatewayError}
        />

        <aside>
          <div className="border border-parchment-300 bg-white">
            <h2 className="border-b border-parchment-300 px-4 py-3 text-lg">
              Your booking
            </h2>
            <div className="divide-y divide-parchment-200">
              {view.lines.map((line) => (
                <div key={line.id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-ink-900">{line.venueName}</p>
                  <p className="mt-0.5 text-ink-500">
                    {formatRange(line.startsAt, line.endsAt, line.timezone)}
                  </p>
                  <p className="mt-1 tabular text-right">
                    {formatCents(line.lineTotalCents, line.currency)}
                  </p>
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
