import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { removeFromCartAction } from "@/app/actions/cart";
import { HoldCountdown } from "@/components/HoldCountdown";
import { PageHero } from "@/components/PageHero";
import { Alert, ButtonLink, EmptyState } from "@/components/ui";
import { findCart, getCartView } from "@/lib/cart";
import { formatCents } from "@/lib/money";
import { formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your cart" };

export default async function CartPage() {
  const cart = await findCart();
  const view = cart ? await getCartView(cart.id) : null;

  if (!view || view.lines.length === 0) {
    return (
      <>
        <PageHero title="Your cart" />
        <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState title="Your cart is empty">
          <p>
            Browse our venues to check availability and reserve your dates.
          </p>
          <div className="mt-4">
            <ButtonLink href="/venues" size="sm">
              Browse venues
            </ButtonLink>
          </div>
        </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero
        title="Your cart"
        lead="Your selected times are held while you complete your booking."
      />

      <div className="mx-auto max-w-4xl px-4 py-10">
      {view.expiresAt && <HoldCountdown expiresAt={view.expiresAt.toISOString()} />}

      <div className="mt-6 border border-parchment-300 bg-white">
        {view.lines.map((line) => (
          <div
            key={line.id}
            className="flex flex-wrap items-start gap-4 border-b border-parchment-200 p-4 last:border-0"
          >
            <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden bg-parchment-200 sm:block">
              {line.imageUrl && (
                <Image
                  src={line.imageUrl}
                  alt={line.venueName}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="min-w-48 flex-1">
              <Link
                href={`/venues/${line.venueSlug}`}
                className="text-lg hover:text-brand-600"
              >
                {line.venueName}
              </Link>
              <p className="mt-0.5 text-sm text-ink-700">
                {formatRange(line.startsAt, line.endsAt, line.timezone)}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {line.rateLabel} × {line.quantity}{" "}
                {line.rateKind === "HOURLY" ? "hours" : "days"}
              </p>
              {line.requiresApproval && (
                <p className="mt-1 text-xs text-amber-800">
                  Subject to management approval
                </p>
              )}
            </div>

            <div className="text-right">
              <p className="tabular text-lg">
                {formatCents(line.lineTotalCents, line.currency)}
              </p>
              <form action={removeFromCartAction}>
                <input type="hidden" name="reservationId" value={line.id} />
                <button
                  type="submit"
                  className="mt-1 text-xs text-ink-500 underline hover:text-red-700"
                >
                  Remove
                </button>
              </form>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between bg-parchment-100 px-4 py-4">
          <span className="text-lg">Subtotal</span>
          <span className="tabular text-xl font-semibold">
            {formatCents(view.subtotalCents, view.currency)}
          </span>
        </div>
      </div>

      {view.requiresApproval && (
        <div className="mt-4">
          <Alert tone="info">
            Your cart includes a venue that requires management approval. Payment is
            taken at checkout and refunded in full if the booking is not approved.
          </Alert>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <ButtonLink href="/venues" variant="secondary">
          Continue browsing
        </ButtonLink>
        <ButtonLink href="/checkout">Proceed to checkout</ButtonLink>
      </div>
      </div>
    </>
  );
}
