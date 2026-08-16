import { cookies } from "next/headers";
import { ReservationStatus } from "@/generated/prisma/enums";
import { checkSlot, bufferedBlock, releaseExpiredHolds } from "./availability";
import { env } from "./env";
import { toCents } from "./money";
import { prisma, isSlotConflict } from "./prisma";
import { quote, quoteToReservationFields } from "./pricing";
import { newSessionId } from "./reference";
import { addMinutes } from "./time";

const CART_COOKIE = "phc_cart";

/**
 * Resolve the caller's cart, creating one on first use.
 *
 * Carts are keyed by an opaque cookie so a customer can assemble a booking
 * before signing in; the cart is claimed by their account at checkout.
 */
export async function getOrCreateCart(userId?: string) {
  const store = await cookies();
  let sessionId = store.get(CART_COOKIE)?.value;

  if (!sessionId) {
    sessionId = newSessionId();
    store.set(CART_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  const cart = await prisma.cart.upsert({
    where: { sessionId },
    create: { sessionId, userId },
    update: userId ? { userId } : {},
  });
  return cart;
}

/** The current cart without creating one — for read-only paths. */
export async function findCart() {
  const store = await cookies();
  const sessionId = store.get(CART_COOKIE)?.value;
  if (!sessionId) return null;
  return prisma.cart.findUnique({ where: { sessionId } });
}

export type CartLine = {
  id: string;
  venueId: string;
  venueName: string;
  venueSlug: string;
  timezone: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  rateLabel: string;
  rateKind: string;
  quantity: string;
  lineTotalCents: number;
  currency: string;
  holdExpiresAt: Date | null;
  requiresApproval: boolean;
};

export type CartView = {
  id: string;
  lines: CartLine[];
  subtotalCents: number;
  currency: string;
  /** Earliest hold expiry across the cart — drives the countdown in the UI. */
  expiresAt: Date | null;
  requiresApproval: boolean;
};

export async function getCartView(cartId: string): Promise<CartView> {
  await releaseExpiredHolds();

  const reservations = await prisma.reservation.findMany({
    where: { cartId, status: ReservationStatus.HELD },
    include: {
      venue: {
        include: {
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const lines: CartLine[] = reservations.map((r) => ({
    id: r.id,
    venueId: r.venueId,
    venueName: r.venue.name,
    venueSlug: r.venue.slug,
    timezone: r.venue.timezone,
    imageUrl: r.venue.images[0]?.url ?? null,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    rateLabel: r.rateLabel,
    rateKind: r.rateKind,
    quantity: r.quantity.toString(),
    lineTotalCents: toCents(r.lineTotal),
    currency: r.currency,
    holdExpiresAt: r.holdExpiresAt,
    requiresApproval: r.venue.workflow === "APPROVAL_REQUIRED",
  }));

  const expiries = lines
    .map((l) => l.holdExpiresAt)
    .filter((d): d is Date => Boolean(d));

  return {
    id: cartId,
    lines,
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
    currency: lines[0]?.currency ?? "ZAR",
    expiresAt: expiries.length
      ? new Date(Math.min(...expiries.map((d) => d.getTime())))
      : null,
    requiresApproval: lines.some((l) => l.requiresApproval),
  };
}

export type AddToCartResult =
  | { ok: true; reservationId: string }
  | { ok: false; message: string; code: string };

/**
 * Place a hold on a venue slot.
 *
 * The slot is validated against every venue rule first, but the hold is only
 * genuinely secured when the insert succeeds — the exclusion constraint is
 * what resolves two customers racing for the same slot.
 */
export async function addToCart(
  cartId: string,
  venueId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<AddToCartResult> {
  const check = await checkSlot(venueId, startsAt, endsAt);
  if (!check.ok) {
    return { ok: false, message: check.message, code: check.code };
  }

  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    include: { rates: true },
  });

  let priced;
  try {
    priced = quote(venue, venue.rates as never, startsAt, endsAt);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "This venue cannot be priced.",
      code: "NO_RATE",
    };
  }

  const { blockStartsAt, blockEndsAt } = bufferedBlock(venue, startsAt, endsAt);

  try {
    const reservation = await prisma.reservation.create({
      data: {
        venueId,
        cartId,
        startsAt,
        endsAt,
        blockStartsAt,
        blockEndsAt,
        status: ReservationStatus.HELD,
        holdExpiresAt: addMinutes(new Date(), env.CART_HOLD_MINUTES),
        ...quoteToReservationFields(priced),
      },
    });
    return { ok: true, reservationId: reservation.id };
  } catch (error) {
    if (isSlotConflict(error)) {
      return {
        ok: false,
        code: "ALREADY_BOOKED",
        message: "Another customer secured that time moments ago.",
      };
    }
    throw error;
  }
}

export async function removeFromCart(
  cartId: string,
  reservationId: string,
): Promise<void> {
  // Deleting rather than cancelling: a cart hold that was never checked out is
  // not part of the booking record and should not clutter reporting.
  await prisma.reservation.deleteMany({
    where: { id: reservationId, cartId, status: ReservationStatus.HELD },
  });
}

export async function clearCart(cartId: string): Promise<void> {
  await prisma.reservation.deleteMany({
    where: { cartId, status: ReservationStatus.HELD },
  });
}

/** Push every hold in the cart out to a fresh expiry, e.g. when checkout starts. */
export async function extendHolds(cartId: string): Promise<void> {
  await prisma.reservation.updateMany({
    where: { cartId, status: ReservationStatus.HELD },
    data: { holdExpiresAt: addMinutes(new Date(), env.CART_HOLD_MINUTES) },
  });
}
