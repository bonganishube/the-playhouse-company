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

  // A session token outlives the row it points at. The JWT is signed and
  // unexpired, so it verifies, but the user can have been deleted since, or
  // the database restored or reseeded underneath it. Attaching that id would
  // violate carts_userId_fkey and fail the whole add-to-cart with a 500, which
  // is a poor answer to a stale cookie. Treat the caller as a guest instead:
  // the cart still works, and it is claimed at checkout once they sign in
  // again for real.
  const ownerId = userId && (await userExists(userId)) ? userId : undefined;

  const cart = await prisma.cart.upsert({
    where: { sessionId },
    create: { sessionId, userId: ownerId },
    update: ownerId ? { userId: ownerId } : {},
  });
  return cart;
}

async function userExists(id: string): Promise<boolean> {
  const found = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!found) {
    console.warn(
      `[cart] session refers to user ${id}, which no longer exists. Continuing as a guest.`,
    );
  }
  return Boolean(found);
}

/** The current cart without creating one, for read-only paths. */
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
  /** Earliest hold expiry across the cart, drives the countdown in the UI. */
  expiresAt: Date | null;
  /**
   * Milliseconds left on that hold, measured as the view was built.
   *
   * Read here rather than in the page so the clock is not consulted during
   * render: a component that calls Date.now() while rendering is not
   * idempotent, and it also gave the countdown a different opening value on
   * the server and the client, which React reports as a hydration mismatch.
   */
  expiresInMs: number;
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

  const expiresAt = expiries.length
    ? new Date(Math.min(...expiries.map((d) => d.getTime())))
    : null;

  return {
    id: cartId,
    lines,
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
    currency: lines[0]?.currency ?? "ZAR",
    expiresAt,
    expiresInMs: expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : 0,
    requiresApproval: lines.some((l) => l.requiresApproval),
  };
}

export type CartGroup = {
  key: string;
  venueId: string;
  venueName: string;
  venueSlug: string;
  timezone: string;
  imageUrl: string | null;
  rateKind: string;
  rateLabel: string;
  /** The individual held slots, earliest first. */
  lines: CartLine[];
  /** Hours or days across the whole group. */
  quantity: number;
  /** "3 days", "4 hours". Singular where it should be. */
  quantityLabel: string;
  totalCents: number;
  currency: string;
  requiresApproval: boolean;
};

/**
 * Collapse a cart into one entry per venue and rate.
 *
 * A multi-day selection is stored as one reservation per day, because each day
 * is a separate occupancy the overlap guard has to test on its own and the days
 * need not be contiguous. Shown raw, a three-day Opera hire read as three
 * identical R27 000 lines, interleaved with other venues by start time, and the
 * only total on the page was the cart subtotal. The storage is right; it was
 * the presentation that hid the amount a customer actually wanted to see.
 *
 * Grouping is by rate as well as venue, so if a tariff changed between two
 * additions the two snapshots stay visibly separate rather than being summed
 * into a figure that matches neither.
 */
export function groupCartLines(lines: CartLine[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const line of lines) {
    const key = `${line.venueId}|${line.rateKind}|${line.rateLabel}`;
    const existing = groups.get(key);

    if (existing) {
      existing.lines.push(line);
      existing.quantity += Number(line.quantity);
      existing.totalCents += line.lineTotalCents;
      continue;
    }

    groups.set(key, {
      key,
      venueId: line.venueId,
      venueName: line.venueName,
      venueSlug: line.venueSlug,
      timezone: line.timezone,
      imageUrl: line.imageUrl,
      rateKind: line.rateKind,
      rateLabel: line.rateLabel,
      lines: [line],
      quantity: Number(line.quantity),
      quantityLabel: "",
      totalCents: line.lineTotalCents,
      currency: line.currency,
      requiresApproval: line.requiresApproval,
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.lines.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    group.quantityLabel = formatQuantity(group.quantity, group.rateKind);
  }

  // Earliest booking first, so the order still follows the diary.
  return result.sort(
    (a, b) => a.lines[0]!.startsAt.getTime() - b.lines[0]!.startsAt.getTime(),
  );
}

/** "1 day", "3 days", "4 hours", "1.5 hours". */
function formatQuantity(quantity: number, rateKind: string): string {
  const unit = rateKind === "HOURLY" ? "hour" : "day";
  // Half-hour bookings are possible, so only drop the decimal when it is whole.
  const shown = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
  return `${shown} ${unit}${quantity === 1 ? "" : "s"}`;
}

export type AddToCartResult =
  | { ok: true; reservationId: string }
  | { ok: false; message: string; code: string };

/**
 * Place a hold on a venue slot.
 *
 * The slot is validated against every venue rule first, but the hold is only
 * genuinely secured when the insert succeeds, the exclusion constraint is
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
