import { addToCart, getCartView, groupCartLines, removeFromCart } from "../cart";
import { getDayAvailability, getDayOptions } from "../availability";
import { createBookingFromCart, initiatePayment, requestCancellation } from "../booking";
import { env } from "../env";
import { formatCents, percentOfCents, toCents } from "../money";
import { prisma } from "../prisma";
import { CURRENT_TERMS_VERSION } from "../terms";
import { formatRange, localToUtc } from "../time";
import { PaymentPurpose } from "@/generated/prisma/enums";

/**
 * What the bot is allowed to do.
 *
 * Every tool here calls the same domain functions the website calls. The bot
 * gets no private path to the database, so the overlap guard, the buffers, the
 * notice periods, the VAT-inclusive pricing and the approval workflow apply
 * identically whether a booking arrives by chat or by form. A second
 * implementation for conversation would be a second set of rules to keep in
 * step, and the first divergence would be a double booking.
 *
 * Two things the bot deliberately cannot do:
 *
 *   - confirm a booking. It creates one and hands over a payment link; money
 *     is taken by the gateway, never in the conversation.
 *   - quote a price of its own. Every amount it says comes back from a tool,
 *     because a language model asked to do arithmetic on a tariff will
 *     eventually get it wrong and the customer will hold us to it.
 */

export type ToolContext = {
  conversationId: string;
  /** The cart this conversation is building, created on first use. */
  cartId: string | null;
  /** Signed-in customer, when the channel knows who they are. */
  userId: string | null;
  /** Where the customer is reachable, for booking contact details. */
  channelHint: { phone?: string; name?: string };
};

export type ToolResult = {
  ok: boolean;
  /** Compact data for the model. Kept small: it is re-sent on every turn. */
  data?: unknown;
  message?: string;
  /** Set when the conversation now owns a cart it did not before. */
  cartId?: string;
};

const APP = env.APP_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Declarations handed to Gemini
// ---------------------------------------------------------------------------

/**
 * Descriptions are written for the model, not for a developer.
 *
 * Each says when to use the tool and what it will not do, because the common
 * failure is a model inventing an answer it could have looked up. Parameters
 * are kept few and flat: deeply nested arguments are filled in wrongly far
 * more often.
 */
export const TOOL_DECLARATIONS = [
  {
    name: "list_venues",
    description:
      "List venues The Playhouse Company hires out, with their rates and capacities. " +
      "Use this whenever the customer asks what is available, how much something costs, " +
      "or mentions a kind of event. Never state a rate that did not come from this tool.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["THEATRE", "FUNCTION_VENUE", "REHEARSAL_VENUE", "RECORDING_STUDIO"],
          description: "Optional filter. Omit to list everything.",
        },
      },
    },
  },
  {
    name: "check_availability",
    description:
      "Check when a venue is free. For a daily-rate venue this returns free dates in a " +
      "month; for an hourly one it returns free time slots on a given date. Always check " +
      "before telling a customer something is available.",
    parameters: {
      type: "object",
      properties: {
        venue_slug: { type: "string", description: "From list_venues." },
        date: {
          type: "string",
          description:
            "YYYY-MM-DD. For hourly venues the day to check. For daily venues any date " +
            "in the month of interest.",
        },
      },
      required: ["venue_slug", "date"],
    },
  },
  {
    name: "add_to_cart",
    description:
      "Hold a venue for the customer. Holds last a short time and are not a booking. " +
      "For a daily-rate venue give only the date; for an hourly one give start and end.",
    parameters: {
      type: "object",
      properties: {
        venue_slug: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "HH:MM, hourly venues only" },
        end_time: { type: "string", description: "HH:MM, hourly venues only" },
      },
      required: ["venue_slug", "date"],
    },
  },
  {
    name: "view_cart",
    description:
      "Show what the customer is currently holding, with the total. Use before checkout " +
      "and whenever they ask what they have chosen.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "remove_from_cart",
    description: "Release one held slot. Get its line_id from view_cart.",
    parameters: {
      type: "object",
      properties: { line_id: { type: "string" } },
      required: ["line_id"],
    },
  },
  {
    name: "create_booking",
    description:
      "Turn the held slots into a booking and return a secure payment link. Requires the " +
      "customer's name, email and telephone, and their explicit agreement to the " +
      "conditions of hire. Do not call this until they have said yes to the terms. " +
      "This does not take payment: the customer pays through the link.",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        organisation: { type: "string" },
        event_title: { type: "string" },
        pay_deposit: {
          type: "boolean",
          description:
            "True only if the customer chose a deposit and view_cart said one is offered.",
        },
        accepted_terms: {
          type: "boolean",
          description: "True only if the customer explicitly agreed to the conditions of hire.",
        },
      },
      required: ["full_name", "email", "phone", "accepted_terms"],
    },
  },
  {
    name: "find_booking",
    description:
      "Look up an existing booking by its reference and the email it was made with. " +
      "Both must match, so never guess either.",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Such as PHC-2026-000123" },
        email: { type: "string" },
      },
      required: ["reference", "email"],
    },
  },
  {
    name: "pay_balance",
    description:
      "Return a payment link for the outstanding balance on a confirmed booking. " +
      "Use find_booking first to confirm the reference and that something is owed.",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string" },
        email: { type: "string" },
      },
      required: ["reference", "email"],
    },
  },
  {
    name: "request_cancellation",
    description:
      "Ask to cancel a booking. An unpaid booking is cancelled at once; a paid one goes " +
      "to staff for review against the conditions of hire. Always tell the customer which " +
      "of the two happened, using the message this returns.",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string" },
        email: { type: "string" },
        reason: { type: "string" },
      },
      required: ["reference", "email", "reason"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
const bool = (a: Args, k: string) => a[k] === true || a[k] === "true";

export async function runTool(
  name: string,
  args: Args,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "list_venues":
      return listVenues(str(args, "category"));
    case "check_availability":
      return checkAvailability(str(args, "venue_slug"), str(args, "date"), ctx);
    case "add_to_cart":
      return addVenueToCart(args, ctx);
    case "view_cart":
      return viewCart(ctx);
    case "remove_from_cart":
      return removeLine(str(args, "line_id"), ctx);
    case "create_booking":
      return createBooking(args, ctx);
    case "find_booking":
      return findBooking(str(args, "reference"), str(args, "email"));
    case "pay_balance":
      return payBalance(str(args, "reference"), str(args, "email"));
    case "request_cancellation":
      return cancel(str(args, "reference"), str(args, "email"), str(args, "reason"));
    default:
      return { ok: false, message: `No such tool: ${name}` };
  }
}

async function listVenues(category: string): Promise<ToolResult> {
  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      ...(category ? { category: category as never } : {}),
    },
    include: { rates: { where: { isActive: true }, take: 1 } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return {
    ok: true,
    data: venues.map((v) => ({
      slug: v.slug,
      name: v.name,
      category: v.category,
      capacity: v.capacity,
      rate: v.rates[0]
        ? `${formatCents(toCents(v.rates[0].amount))} per ${v.rateBasis === "DAILY" ? "day" : "hour"}`
        : "on application",
      sold_by: v.rateBasis === "DAILY" ? "day" : "hour",
      needs_approval: v.workflow === "APPROVAL_REQUIRED",
      deposit_allowed: v.paymentPolicy === "DEPOSIT_ALLOWED",
      url: `${APP}/venues/${v.slug}`,
    })),
  };
}

async function checkAvailability(
  slug: string,
  date: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const venue = await prisma.venue.findUnique({ where: { slug } });
  if (!venue) return { ok: false, message: `No venue with slug "${slug}".` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Give the date as YYYY-MM-DD." };
  }

  if (venue.rateBasis === "DAILY") {
    const from = `${date.slice(0, 7)}-01`;
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    const to = end.toISOString().slice(0, 10);
    // The customer's own holds are not a clash with themselves, so they are
    // excluded here and reported separately. Left in, this call contradicted
    // the one that placed the hold moments earlier and the assistant told the
    // customer their date had gone.
    const { days } = await getDayOptions(venue.id, from, to, undefined, {
      ignoreCartId: ctx.cartId ?? undefined,
    });
    return {
      ok: true,
      data: {
        venue: venue.name,
        sold_by: "day",
        month: date.slice(0, 7),
        available_dates: days.filter((d) => d.available).map((d) => d.date),
        // Named so the model tells the customer what it is already holding for
        // them instead of offering it as though it were new.
        already_held_for_this_customer: await heldByCustomer(venue.id, ctx, from, to),
      },
    };
  }

  // Hourly: report the free runs rather than every increment, which keeps the
  // payload small and is how a person would describe availability anyway.
  const day = await getDayAvailability(venue.id, date, undefined, {
    ignoreCartId: ctx.cartId ?? undefined,
  });
  if (!day.isOpen) {
    return { ok: true, data: { venue: venue.name, date, closed: true } };
  }
  const free: string[] = [];
  let runStart: number | null = null;
  for (const slot of [...day.slots, null]) {
    if (slot?.available) {
      runStart ??= slot.startMinutes;
    } else if (runStart !== null) {
      const previous = day.slots[day.slots.indexOf(slot as never) - 1] ?? day.slots.at(-1)!;
      free.push(`${clock(runStart)}-${clock(previous.endMinutes)}`);
      runStart = null;
    }
  }
  return {
    ok: true,
    data: {
      venue: venue.name,
      sold_by: "hour",
      date,
      minimum_booking_minutes: day.minBookingMinutes,
      free_periods: free,
      already_held_for_this_customer: await heldByCustomer(venue.id, ctx, date, date),
    },
  };
}

/** What this conversation is already holding at a venue, in plain language. */
async function heldByCustomer(
  venueId: string,
  ctx: ToolContext,
  from: string,
  to: string,
): Promise<string[]> {
  if (!ctx.cartId) return [];
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { timezone: true },
  });
  const held = await prisma.reservation.findMany({
    where: {
      cartId: ctx.cartId,
      venueId,
      startsAt: { lt: new Date(`${to}T23:59:59.999Z`) },
      endsAt: { gt: new Date(`${from}T00:00:00.000Z`) },
    },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, endsAt: true },
  });
  return held.map((h) => formatRange(h.startsAt, h.endsAt, venue.timezone));
}

/** Create the conversation's cart the first time it holds something. */
async function ensureCart(ctx: ToolContext): Promise<string> {
  if (ctx.cartId) return ctx.cartId;
  const cart = await prisma.cart.create({
    data: {
      sessionId: `bot-${ctx.conversationId}`,
      userId: ctx.userId ?? undefined,
    },
  });
  await prisma.botConversation.update({
    where: { id: ctx.conversationId },
    data: { cartId: cart.id },
  });
  ctx.cartId = cart.id;
  return cart.id;
}

async function addVenueToCart(args: Args, ctx: ToolContext): Promise<ToolResult> {
  const slug = str(args, "venue_slug");
  const date = str(args, "date");
  const venue = await prisma.venue.findUnique({ where: { slug } });
  if (!venue) return { ok: false, message: `No venue with slug "${slug}".` };

  // Before the availability question, not after: the answer depends on which
  // cart is asking, since a customer's own hold must not read as a clash.
  const cartId = await ensureCart(ctx);

  let startsAt: Date;
  let endsAt: Date;

  if (venue.rateBasis === "DAILY") {
    // The hire window for that date, taken from the same source the website
    // uses, so a day booked by chat covers exactly the hours a day booked by
    // form does.
    const { days } = await getDayOptions(venue.id, date, date, undefined, {
      ignoreCartId: cartId,
    });
    const option = days[0];
    if (!option || !option.available) {
      return {
        ok: false,
        message: `${venue.name} is not available on ${date}. Offer another date.`,
      };
    }
    startsAt = new Date(option.startsAt);
    endsAt = new Date(option.endsAt);
  } else {
    const start = str(args, "start_time");
    const end = str(args, "end_time");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      return {
        ok: false,
        message: `${venue.name} is booked by the hour, so a start and end time are needed, as HH:MM.`,
      };
    }
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    startsAt = localToUtc(date, mins(start), venue.timezone);
    endsAt = localToUtc(date, mins(end), venue.timezone);
  }

  const held = await addToCart(cartId, venue.id, startsAt, endsAt);
  if (!held.ok) return { ok: false, message: held.message };

  const view = await getCartView(cartId);
  return {
    ok: true,
    cartId,
    data: {
      held: `${venue.name}, ${formatRange(startsAt, endsAt, venue.timezone)}`,
      cart_total: formatCents(view.subtotalCents, view.currency),
      hold_expires: view.expiresAt?.toISOString() ?? null,
      needs_approval: venue.workflow === "APPROVAL_REQUIRED",
    },
  };
}

async function viewCart(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.cartId) return { ok: true, data: { empty: true } };
  const view = await getCartView(ctx.cartId);
  if (view.lines.length === 0) return { ok: true, data: { empty: true } };

  const groups = groupCartLines(view.lines);
  const venues = await prisma.venue.findMany({
    where: { id: { in: view.lines.map((l) => l.venueId) } },
    select: { paymentPolicy: true, depositPercent: true },
  });
  const depositAllowed =
    venues.length > 0 && venues.every((v) => v.paymentPolicy === "DEPOSIT_ALLOWED");
  const depositPercent = Math.max(...venues.map((v) => v.depositPercent));

  return {
    ok: true,
    data: {
      items: groups.map((g) => ({
        line_ids: g.lines.map((l) => l.id),
        venue: g.venueName,
        when: g.lines.map((l) => formatRange(l.startsAt, l.endsAt, l.timezone)),
        quantity: g.quantityLabel,
        subtotal: formatCents(g.totalCents, g.currency),
        needs_approval: g.requiresApproval,
      })),
      total: formatCents(view.subtotalCents, view.currency),
      deposit_offered: depositAllowed
        ? {
            percent: depositPercent,
            amount: formatCents(
              percentOfCents(view.subtotalCents, depositPercent),
              view.currency,
            ),
          }
        : null,
      hold_expires: view.expiresAt?.toISOString() ?? null,
    },
  };
}

async function removeLine(lineId: string, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.cartId) return { ok: false, message: "Nothing is being held." };
  await removeFromCart(ctx.cartId, lineId);
  return viewCart(ctx);
}

async function createBooking(args: Args, ctx: ToolContext): Promise<ToolResult> {
  if (!bool(args, "accepted_terms")) {
    return {
      ok: false,
      message:
        "The customer has not agreed to the conditions of hire. Show them " +
        `${APP}/conditions-of-hire and ask them to confirm before trying again.`,
    };
  }
  if (!ctx.cartId) return { ok: false, message: "Nothing is being held to book." };

  const view = await getCartView(ctx.cartId);
  if (view.lines.length === 0) {
    return { ok: false, message: "The hold has lapsed. Choose the dates again." };
  }

  const email = str(args, "email").toLowerCase();
  if (!email.includes("@")) return { ok: false, message: "A valid email address is needed." };

  // An existing account is never assumed from an email typed into a chat.
  // Doing so would let anyone book, or later read, another person's booking.
  const existing = await prisma.user.findUnique({ where: { email } });
  let userId = ctx.userId;
  if (!userId) {
    if (existing) {
      return {
        ok: false,
        message:
          `An account already exists for ${email}. Ask the customer to book through ` +
          `${APP}/checkout, where they can sign in. Do not continue here.`,
      };
    }
    const created = await prisma.user.create({
      data: {
        email,
        fullName: str(args, "full_name"),
        phone: str(args, "phone"),
        organisation: str(args, "organisation") || undefined,
      },
    });
    userId = created.id;
  }

  const booking = await createBookingFromCart(
    ctx.cartId,
    userId,
    {
      contactName: str(args, "full_name"),
      contactEmail: email,
      contactPhone: str(args, "phone"),
      organisation: str(args, "organisation") || undefined,
      eventTitle: str(args, "event_title") || undefined,
    },
    { payDeposit: bool(args, "pay_deposit"), termsVersion: CURRENT_TERMS_VERSION },
  );
  if (!booking.ok) return { ok: false, message: booking.message };

  const { checkout } = await initiatePayment(
    booking.bookingId,
    bool(args, "pay_deposit") ? PaymentPurpose.DEPOSIT : PaymentPurpose.FULL,
  );
  const payUrl =
    checkout.kind === "redirect"
      ? checkout.url
      : `${APP}/checkout/redirect/${booking.reference}`;

  const saved = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.bookingId },
  });

  return {
    ok: true,
    data: {
      reference: booking.reference,
      amount_due_now: formatCents(toCents(saved.amountDue), saved.currency),
      total: formatCents(toCents(saved.total), saved.currency),
      payment_link: payUrl,
      booking_page: `${APP}/booking/${booking.reference}`,
      note:
        "The booking is not secure until this link is paid. Give the customer the link " +
        "and the reference verbatim.",
    },
  };
}

/**
 * Both the reference and the email must match.
 *
 * A reference alone is guessable and would expose one customer's booking to
 * another. This is the same pairing the public "find a booking" page uses.
 */
async function loadBooking(reference: string, email: string) {
  return prisma.booking.findFirst({
    where: {
      reference: reference.trim().toUpperCase(),
      contactEmail: email.trim().toLowerCase(),
    },
    include: { reservations: { include: { venue: true } } },
  });
}

async function findBooking(reference: string, email: string): Promise<ToolResult> {
  const booking = await loadBooking(reference, email);
  if (!booking) {
    return {
      ok: false,
      message:
        "No booking matches that reference and email address together. Ask the customer " +
        "to check both. Do not guess or try other addresses.",
    };
  }

  const outstanding = toCents(booking.total) - toCents(booking.amountPaid);
  return {
    ok: true,
    data: {
      reference: booking.reference,
      status: booking.status,
      venues: booking.reservations.map(
        (r) => `${r.venue.name}, ${formatRange(r.startsAt, r.endsAt, r.venue.timezone)}`,
      ),
      total: formatCents(toCents(booking.total), booking.currency),
      paid: formatCents(toCents(booking.amountPaid), booking.currency),
      outstanding: formatCents(outstanding, booking.currency),
      outstanding_cents: outstanding,
      cancellation_requested: booking.cancellationRequestedAt !== null,
      booking_page: `${APP}/booking/${booking.reference}`,
    },
  };
}

async function payBalance(reference: string, email: string): Promise<ToolResult> {
  const booking = await loadBooking(reference, email);
  if (!booking) return { ok: false, message: "No booking matches that reference and email." };

  const outstanding = toCents(booking.total) - toCents(booking.amountPaid);
  if (outstanding <= 0) return { ok: true, data: { message: "Nothing is outstanding." } };
  if (booking.status === "CANCELLED" || booking.status === "REJECTED") {
    return { ok: false, message: "That booking is no longer active." };
  }

  const { checkout } = await initiatePayment(booking.id, PaymentPurpose.BALANCE);
  return {
    ok: true,
    data: {
      reference: booking.reference,
      amount: formatCents(outstanding, booking.currency),
      payment_link:
        checkout.kind === "redirect"
          ? checkout.url
          : `${APP}/checkout/redirect/${booking.reference}`,
    },
  };
}

async function cancel(
  reference: string,
  email: string,
  reason: string,
): Promise<ToolResult> {
  if (reason.trim().length < 3) {
    return { ok: false, message: "Ask the customer why they are cancelling first." };
  }
  const booking = await loadBooking(reference, email);
  if (!booking) return { ok: false, message: "No booking matches that reference and email." };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: booking.userId } });
  const result = await requestCancellation(
    booking.id,
    { id: user.id, email: user.email, fullName: user.fullName },
    reason,
  );
  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    data: {
      outcome: result.outcome,
      message:
        result.outcome === "CANCELLED"
          ? "Cancelled, and the dates are released."
          : "The request has gone to venue management. The booking stands until they decide, and the customer will be written to either way.",
    },
  };
}

/** Minutes from midnight as HH:MM, for describing free periods. */
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
