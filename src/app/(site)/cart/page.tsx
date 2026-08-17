import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { removeFromCartAction } from "@/app/actions/cart";
import { HoldCountdown } from "@/components/HoldCountdown";
import { PageHero } from "@/components/PageHero";
import { Alert, ButtonLink, EmptyState } from "@/components/ui";
import { findCart, getCartView, groupCartLines } from "@/lib/cart";
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

  // One entry per venue, so a multi-day hire shows its total rather than the
  // same amount repeated once per day.
  const groups = groupCartLines(view.lines);

  return (
    <>
      <PageHero
        title="Your cart"
        lead="Your selected times are held while you complete your booking."
      />

      <div className="mx-auto max-w-4xl px-4 py-10">
      {view.expiresAt && (
        <HoldCountdown
          expiresAt={view.expiresAt.toISOString()}
          initialRemainingMs={view.expiresInMs}
        />
      )}

      <div className="mt-6 border border-parchment-300 bg-white">
        {groups.map((group) => (
          <div
            key={group.key}
            className="border-b border-parchment-200 p-4 last:border-0"
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden bg-parchment-200 sm:block">
                {group.imageUrl && (
                  <Image
                    src={group.imageUrl}
                    alt={group.venueName}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                )}
              </div>

              <div className="min-w-48 flex-1">
                <Link
                  href={`/venues/${group.venueSlug}`}
                  className="text-lg hover:text-brand-600"
                >
                  {group.venueName}
                </Link>
                {/* A single date reads better on the venue line itself; only a
                    multi-date hire needs the breakdown below. */}
                {group.lines.length === 1 && (
                  <p className="mt-0.5 text-sm text-ink-700">
                    {formatRange(
                      group.lines[0]!.startsAt,
                      group.lines[0]!.endsAt,
                      group.timezone,
                    )}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-ink-500">
                  {group.rateLabel} × {group.quantityLabel}
                </p>
                {group.requiresApproval && (
                  <p className="mt-1 text-xs text-amber-800">
                    Subject to management approval
                  </p>
                )}
              </div>

              <div className="text-right">
                <p className="tabular text-lg font-semibold">
                  {formatCents(group.totalCents, group.currency)}
                </p>
                {group.lines.length > 1 ? (
                  <p className="text-xs text-ink-500">{group.lines.length} dates</p>
                ) : (
                  <form action={removeFromCartAction}>
                    <input
                      type="hidden"
                      name="reservationId"
                      value={group.lines[0]!.id}
                    />
                    <button
                      type="submit"
                      className="mt-1 text-xs text-ink-500 underline hover:text-red-700"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* The individual holds stay listed and individually removable. A
                single summed line would give the total but take away the
                ability to drop one date without rebuilding the selection. */}
            {group.lines.length > 1 && (
              <ul className="mt-3 divide-y divide-parchment-200 border-t border-parchment-200 sm:ml-32">
                {group.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"
                  >
                    <span className="text-ink-700">
                      {formatRange(line.startsAt, line.endsAt, line.timezone)}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular text-ink-500">
                        {formatCents(line.lineTotalCents, line.currency)}
                      </span>
                      <form action={removeFromCartAction}>
                        <input type="hidden" name="reservationId" value={line.id} />
                        <button
                          type="submit"
                          className="text-xs text-ink-500 underline hover:text-red-700"
                        >
                          Remove
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
