import {
  BookingStatus,
  BookingWorkflow,
  GatewayId,
  PaymentPolicy,
  PaymentPurpose,
  PaymentStatus,
  ReservationStatus,
} from "@/generated/prisma/enums";
import { checkSlot } from "./availability";
import { recordAudit } from "./audit";
import { env } from "./env";
import {
  fromCents,
  percentOfCents,
  toCents,
  vatPortionOfInclusive,
} from "./money";
import { getGateway } from "./payments";
import type { WebhookResult } from "./payments";
import { isSlotConflict, prisma } from "./prisma";
import {
  nextBookingReference,
  nextReceiptNumber,
  paymentReference,
} from "./reference";
import { addMinutes } from "./time";
import { syncBookingToCalendar, removeBookingFromCalendar } from "./calendar/sync";
import {
  sendApprovalRequestEmail,
  sendBookingConfirmedEmail,
  sendBookingCancelledEmail,
  sendBookingRejectedEmail,
  sendCancellationDeclinedEmail,
  sendCancellationRequestEmail,
  sendPaymentReceiptEmail,
} from "./email/send";

/**
 * How long a customer has to complete payment before their reservations are
 * released. Longer than a cart hold, since they may be mid-way through a
 * bank's 3-D Secure flow.
 */
export const PAYMENT_WINDOW_MINUTES = 60;

export type ContactDetails = {
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  organisation?: string;
  eventTitle?: string;
  purpose?: string;
};

export type CreateBookingResult =
  | { ok: true; bookingId: string; reference: string }
  | { ok: false; message: string; code: string };

/**
 * Convert a cart into a booking.
 *
 * Every held slot is re-validated inside the transaction: a hold may have
 * lapsed, or a venue may have been closed since it was added. Reservations are
 * moved from HELD to PENDING_PAYMENT, which keeps them occupying the venue
 * under the same exclusion constraint.
 */
export async function createBookingFromCart(
  cartId: string,
  userId: string,
  contact: ContactDetails,
  options: { payDeposit?: boolean; termsVersion?: string } = {},
): Promise<CreateBookingResult> {
  const reservations = await prisma.reservation.findMany({
    where: { cartId, status: ReservationStatus.HELD },
    include: { venue: true },
    orderBy: { startsAt: "asc" },
  });

  if (reservations.length === 0) {
    return { ok: false, code: "EMPTY_CART", message: "Your cart is empty." };
  }

  // Re-check each slot; a lapsed hold could have been taken by someone else.
  for (const r of reservations) {
    const check = await checkSlot(r.venueId, r.startsAt, r.endsAt, {
      ignoreReservationId: r.id,
      // The rest of this same cart is not a clash either; only somebody else's
      // occupancy can stop the checkout. The exclusion constraint remains the
      // authority at write time.
      ignoreCartId: cartId,
    });
    if (!check.ok) {
      return {
        ok: false,
        code: check.code,
        message: `${r.venue.name}: ${check.message}`,
      };
    }
  }

  const subtotalCents = reservations.reduce(
    (sum, r) => sum + toCents(r.lineTotal),
    0,
  );
  const totalCents = subtotalCents;

  // A booking needs approval if any venue in it does.
  const workflow = reservations.some(
    (r) => r.venue.workflow === BookingWorkflow.APPROVAL_REQUIRED,
  )
    ? BookingWorkflow.APPROVAL_REQUIRED
    : BookingWorkflow.INSTANT;

  // A deposit is only offered when every venue in the booking permits one.
  const depositPermitted = reservations.every(
    (r) => r.venue.paymentPolicy === PaymentPolicy.DEPOSIT_ALLOWED,
  );
  const useDeposit = Boolean(options.payDeposit) && depositPermitted;

  // The most conservative (highest) deposit percentage across the venues.
  const depositPercent = Math.max(
    ...reservations.map((r) => r.venue.depositPercent),
  );
  const amountDueCents = useDeposit
    ? percentOfCents(totalCents, depositPercent)
    : totalCents;

  const currency = reservations[0]!.currency;

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const reference = await nextBookingReference(tx as never);

      const created = await tx.booking.create({
        data: {
          reference,
          userId,
          status: BookingStatus.PENDING_PAYMENT,
          contactName: contact.contactName,
          contactEmail: contact.contactEmail,
          contactPhone: contact.contactPhone,
          organisation: contact.organisation,
          eventTitle: contact.eventTitle,
          purpose: contact.purpose,
          // Which wording the customer agreed to, fixed at the moment of
          // purchase. Looking it up later would apply whatever the document
          // says then, which is not what they accepted.
          termsVersion: options.termsVersion ?? null,
          termsAcceptedAt: options.termsVersion ? new Date() : null,
          currency,
          subtotal: fromCents(subtotalCents),
          total: fromCents(totalCents),
          // Tariff is VAT-inclusive: the VAT portion is extracted from the
          // total, and both it and the rate are snapshotted so a change to the
          // statutory rate cannot alter a historical tax invoice.
          vatRate: env.VAT_RATE.toFixed(2),
          vatAmount: fromCents(vatPortionOfInclusive(totalCents, env.VAT_RATE)),
          amountDue: fromCents(amountDueCents),
          amountPaid: fromCents(0),
          paymentPolicy: useDeposit
            ? PaymentPolicy.DEPOSIT_ALLOWED
            : PaymentPolicy.FULL_UPFRONT,
          workflow,
        },
      });

      await tx.reservation.updateMany({
        where: { id: { in: reservations.map((r) => r.id) } },
        data: {
          cartId: null,
          bookingId: created.id,
          status: ReservationStatus.PENDING_PAYMENT,
          holdExpiresAt: addMinutes(new Date(), PAYMENT_WINDOW_MINUTES),
        },
      });

      return created;
    });

    await recordAudit({
      actor: { id: userId, label: contact.contactEmail },
      action: "booking.created",
      entityType: "Booking",
      entityId: booking.id,
      metadata: {
        reference: booking.reference,
        totalCents,
        amountDueCents,
        workflow,
      },
    });

    return { ok: true, bookingId: booking.id, reference: booking.reference };
  } catch (error) {
    if (isSlotConflict(error)) {
      return {
        ok: false,
        code: "ALREADY_BOOKED",
        message: "One of your selected times was just taken. Please review your cart.",
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Payment initiation
// ---------------------------------------------------------------------------

export async function initiatePayment(
  bookingId: string,
  purpose: PaymentPurpose = PaymentPurpose.FULL,
  gatewayId: GatewayId = env.PAYMENT_GATEWAY as GatewayId,
) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { reservations: { include: { venue: true } } },
  });

  // A BALANCE payment settles everything still owed on the booking, not merely
  // the amount that was required upfront. Without this a deposit booking would
  // confirm and then offer the customer no way to pay the remainder, because
  // the upfront requirement had already been met.
  const paidCents = toCents(booking.amountPaid);
  const targetCents =
    purpose === PaymentPurpose.BALANCE
      ? toCents(booking.total)
      : toCents(booking.amountDue);
  const outstandingCents = targetCents - paidCents;

  if (outstandingCents <= 0) {
    throw new Error("This booking has no outstanding amount.");
  }

  // Raise the recorded requirement to match what is being collected, so the
  // financial position stays consistent across the booking and the reports.
  if (purpose === PaymentPurpose.BALANCE && targetCents > toCents(booking.amountDue)) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { amountDue: fromCents(targetCents) },
    });
  }

  const gateway = getGateway(gatewayId);
  if (!gateway.isConfigured()) {
    throw new Error(`${gateway.displayName} is not configured.`);
  }

  const reference = paymentReference(booking.reference);
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      gateway: gatewayId,
      purpose,
      status: PaymentStatus.INITIATED,
      amount: fromCents(outstandingCents),
      currency: booking.currency,
      reference,
    },
  });

  const venueNames = booking.reservations.map((r) => r.venue.name).join(", ");
  const checkout = await gateway.createCheckout({
    reference,
    amountCents: outstandingCents,
    currency: booking.currency,
    description: `Venue hire, ${venueNames}`,
    bookingReference: booking.reference,
    customerName: booking.contactName,
    customerEmail: booking.contactEmail,
    returnUrl: `${env.APP_URL}/booking/${booking.reference}?payment=return`,
    cancelUrl: `${env.APP_URL}/booking/${booking.reference}?payment=cancelled`,
    notifyUrl: `${env.APP_URL}/api/payments/webhook/${gatewayId.toLowerCase()}`,
  });

  // The updated row is returned, not the one created above, callers need the
  // gateway reference and the PENDING status, both of which are set here.
  const [pending] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PENDING,
        gatewayReference: checkout.gatewayReference,
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        type: "checkout.created",
        verified: true,
        payload: {
          gateway: gatewayId,
          amountCents: outstandingCents,
          kind: checkout.kind,
          url: checkout.url,
        } as never,
      },
    }),
  ]);

  return { payment: pending, checkout };
}

/**
 * Rebuild the gateway handover for a payment that is already in flight.
 *
 * Used by the redirect page for providers requiring a signed form POST, which
 * a server action cannot issue directly. The original payment reference is
 * reused, so no duplicate payment record is created and the signature matches
 * the one the gateway will reconcile against.
 */
export async function rebuildCheckout(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { reservations: { include: { venue: true } } },
  });

  const payment = await prisma.payment.findFirst({
    where: {
      bookingId,
      status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw new Error("No payment is awaiting completion for this booking.");

  const gateway = getGateway(payment.gateway);
  const venueNames = booking.reservations.map((r) => r.venue.name).join(", ");

  const checkout = await gateway.createCheckout({
    reference: payment.reference,
    amountCents: toCents(payment.amount),
    currency: payment.currency,
    description: `Venue hire, ${venueNames}`,
    bookingReference: booking.reference,
    customerName: booking.contactName,
    customerEmail: booking.contactEmail,
    returnUrl: `${env.APP_URL}/booking/${booking.reference}?payment=return`,
    cancelUrl: `${env.APP_URL}/booking/${booking.reference}?payment=cancelled`,
    notifyUrl: `${env.APP_URL}/api/payments/webhook/${payment.gateway.toLowerCase()}`,
  });

  return { booking, payment, checkout };
}

// ---------------------------------------------------------------------------
// Payment settlement
// ---------------------------------------------------------------------------

export type SettlementOutcome = {
  handled: boolean;
  reason?: string;
  bookingId?: string;
  bookingStatus?: BookingStatus;
};

/**
 * Apply a verified gateway callback.
 *
 * Idempotent by design: gateways retry callbacks, and a customer returning to
 * the site can trigger a reconciliation for the same payment. A payment that
 * has already succeeded is acknowledged without being applied twice.
 */
export async function settlePayment(
  gatewayId: GatewayId,
  result: WebhookResult,
  sourceIp?: string,
): Promise<SettlementOutcome> {
  if (!result.reference) {
    return { handled: false, reason: "Callback carried no payment reference" };
  }

  const payment = await prisma.payment.findUnique({
    where: { reference: result.reference },
    include: { booking: true },
  });
  if (!payment) {
    return { handled: false, reason: "Unknown payment reference" };
  }

  // Everything inbound is recorded, verified or not, this is the audit trail.
  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: `webhook.${result.status.toLowerCase()}`,
      verified: result.verified,
      payload: result.raw as never,
      sourceIp,
    },
  });

  if (!result.verified) {
    return { handled: false, reason: result.reason ?? "Unverified callback" };
  }

  if (payment.status === PaymentStatus.SUCCEEDED) {
    return {
      handled: true,
      reason: "Already settled",
      bookingId: payment.bookingId,
      bookingStatus: payment.booking.status,
    };
  }

  if (result.status !== "SUCCEEDED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status:
          result.status === "FAILED"
            ? PaymentStatus.FAILED
            : result.status === "CANCELLED"
              ? PaymentStatus.CANCELLED
              : PaymentStatus.PENDING,
        failureReason: result.reason,
        gatewayReference: result.gatewayReference ?? payment.gatewayReference,
      },
    });
    return {
      handled: true,
      reason: `Payment ${result.status.toLowerCase()}`,
      bookingId: payment.bookingId,
    };
  }

  // Guard against a callback reporting a different amount to the one requested.
  const expectedCents = toCents(payment.amount);
  if (result.amountCents !== undefined && result.amountCents !== expectedCents) {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        type: "webhook.amount_mismatch",
        verified: false,
        payload: {
          expectedCents,
          receivedCents: result.amountCents,
        } as never,
        sourceIp,
      },
    });
    return {
      handled: false,
      reason: `Amount mismatch: expected ${expectedCents}, received ${result.amountCents}`,
    };
  }

  const outcome = await applySuccessfulPayment(
    payment.id,
    result.gatewayReference,
  );

  await dispatchPostConfirmation(outcome.bookingId, outcome.status, payment.id);

  return {
    handled: true,
    bookingId: outcome.bookingId,
    bookingStatus: outcome.status,
  };
}

/**
 * Mark a payment successful and move the booking to its next state, in one
 * transaction so a partial application can never be observed.
 */
async function applySuccessfulPayment(
  paymentId: string,
  gatewayReference?: string,
): Promise<{ bookingId: string; status: BookingStatus }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { booking: true },
    });

    const receiptNumber = await nextReceiptNumber(tx as never);
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
        receiptNumber,
        gatewayReference: gatewayReference ?? payment.gatewayReference,
      },
    });

    const booking = payment.booking;
    const paidCents = toCents(booking.amountPaid) + toCents(payment.amount);
    const dueCents = toCents(booking.amountDue);
    const settled = paidCents >= dueCents;

    // A booking that has already been decided keeps its status. Without this,
    // settling a balance on an approved booking would re-apply the approval
    // rule and send a confirmed booking back to awaiting approval, undoing a
    // decision staff had already taken.
    const alreadyDecided =
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.COMPLETED;

    // Instant venues confirm on payment; venues under an approval workflow
    // wait for an administrator even once payment has cleared.
    const nextStatus: BookingStatus = alreadyDecided
      ? booking.status
      : !settled
        ? BookingStatus.PENDING_PAYMENT
        : booking.workflow === BookingWorkflow.APPROVAL_REQUIRED
          ? BookingStatus.PENDING_APPROVAL
          : BookingStatus.CONFIRMED;

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        amountPaid: fromCents(paidCents),
        status: nextStatus,
        confirmedAt:
          nextStatus === BookingStatus.CONFIRMED && !booking.confirmedAt
            ? new Date()
            : undefined,
      },
    });

    if (settled) {
      await tx.reservation.updateMany({
        where: { bookingId: booking.id, status: ReservationStatus.PENDING_PAYMENT },
        data: {
          status:
            nextStatus === BookingStatus.CONFIRMED
              ? ReservationStatus.CONFIRMED
              : ReservationStatus.PENDING_APPROVAL,
          // No longer time-limited: payment has cleared.
          holdExpiresAt: null,
        },
      });
    }

    return { bookingId: booking.id, status: nextStatus };
  });
}

/**
 * Side effects that follow a state change, calendar synchronisation and
 * customer correspondence. Deliberately outside the transaction, and
 * individually guarded: a mail server outage must not roll back a paid booking.
 */
async function dispatchPostConfirmation(
  bookingId: string,
  status: BookingStatus,
  paymentId?: string,
) {
  if (paymentId) {
    await safely("payment receipt", () => sendPaymentReceiptEmail(paymentId));
  }

  if (status === BookingStatus.CONFIRMED) {
    await safely("calendar sync", () => syncBookingToCalendar(bookingId));
    await safely("confirmation email", () => sendBookingConfirmedEmail(bookingId));
  } else if (status === BookingStatus.PENDING_APPROVAL) {
    await safely("approval request", () => sendApprovalRequestEmail(bookingId));
  }

  await recordAudit({
    actor: null,
    action: `booking.${status.toLowerCase()}`,
    entityType: "Booking",
    entityId: bookingId,
    metadata: { status },
  });
}

async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.error(`[booking] ${label} failed:`, error);
  }
}

/**
 * Ask the gateway directly what became of a booking's in-flight payment, and
 * apply the answer.
 *
 * Called when a customer returns from the payment page, and from the
 * maintenance sweep. This is what prevents a lost or delayed webhook from
 * leaving a paid booking unconfirmed, the customer's money has moved, so the
 * booking must follow regardless of whether the callback arrived.
 *
 * Settlement runs through the same idempotent path as a webhook, so a payment
 * already applied is simply acknowledged.
 */
export async function reconcileBookingPayments(
  bookingId: string,
): Promise<SettlementOutcome[]> {
  const payments = await prisma.payment.findMany({
    where: {
      bookingId,
      status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] },
      gatewayReference: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  const outcomes: SettlementOutcome[] = [];

  for (const payment of payments) {
    const gateway = getGateway(payment.gateway);
    if (!gateway.reconcile || !gateway.isConfigured()) continue;

    try {
      const result = await gateway.reconcile(payment.gatewayReference!);
      // The provider identifies the transaction; our reference is authoritative.
      outcomes.push(
        await settlePayment(payment.gateway, {
          ...result,
          reference: result.reference ?? payment.reference,
        }),
      );
    } catch (error) {
      console.error(
        `[booking] reconciliation failed for payment ${payment.reference}`,
        error,
      );
    }
  }

  return outcomes;
}

/**
 * Sweep in-flight payments across all recent unconfirmed bookings. Belt and
 * braces behind the on-return reconciliation, for customers who close the tab.
 */
export async function reconcileStalePayments(
  now: Date = new Date(),
): Promise<number> {
  const candidates = await prisma.booking.findMany({
    where: {
      status: BookingStatus.PENDING_PAYMENT,
      // Give the webhook a chance to arrive first.
      createdAt: {
        gte: new Date(now.getTime() - 7 * 86_400_000),
        lte: new Date(now.getTime() - 2 * 60_000),
      },
      payments: {
        some: {
          status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] },
          gatewayReference: { not: null },
        },
      },
    },
    select: { id: true },
    take: 100,
  });

  let applied = 0;
  for (const booking of candidates) {
    const outcomes = await reconcileBookingPayments(booking.id);
    if (outcomes.some((o) => o.handled)) applied += 1;
  }
  return applied;
}

// ---------------------------------------------------------------------------
// Administrative actions
// ---------------------------------------------------------------------------

export async function approveBooking(
  bookingId: string,
  actor: { id: string; email: string; fullName: string },
) {
  const booking = await prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (current.status !== BookingStatus.PENDING_APPROVAL) {
      throw new Error(
        `Only bookings awaiting approval can be approved (this one is ${current.status}).`,
      );
    }
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        approvedAt: new Date(),
        approvedById: actor.id,
        confirmedAt: new Date(),
      },
    });
    await tx.reservation.updateMany({
      where: { bookingId, status: ReservationStatus.PENDING_APPROVAL },
      data: { status: ReservationStatus.CONFIRMED },
    });
    return updated;
  });

  await recordAudit({
    actor: { id: actor.id, label: `${actor.fullName} <${actor.email}>` },
    action: "booking.approved",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { reference: booking.reference },
  });

  await safely("calendar sync", () => syncBookingToCalendar(bookingId));
  await safely("confirmation email", () => sendBookingConfirmedEmail(bookingId));

  return booking;
}

export async function rejectBooking(
  bookingId: string,
  actor: { id: string; email: string; fullName: string },
  reason: string,
) {
  const booking = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
    // Releases the slots for other customers.
    await tx.reservation.updateMany({
      where: { bookingId },
      data: { status: ReservationStatus.REJECTED },
    });
    return updated;
  });

  await recordAudit({
    actor: { id: actor.id, label: `${actor.fullName} <${actor.email}>` },
    action: "booking.rejected",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { reference: booking.reference, reason },
  });

  await safely("rejection email", () => sendBookingRejectedEmail(bookingId));
  return booking;
}

export async function cancelBooking(
  bookingId: string,
  actor: { id?: string; email: string; fullName: string },
  reason: string,
) {
  await safely("calendar removal", () => removeBookingFromCalendar(bookingId));

  const booking = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancellationRequestedAt: null,
        cancellationRequestReason: null,
      },
    });
    await tx.reservation.updateMany({
      where: { bookingId },
      data: { status: ReservationStatus.CANCELLED, outlookEventId: null },
    });
    return updated;
  });

  await recordAudit({
    actor: { id: actor.id, label: `${actor.fullName} <${actor.email}>` },
    action: "booking.cancelled",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { reference: booking.reference, reason },
  });

  await safely("cancellation email", () => sendBookingCancelledEmail(bookingId));
  return booking;
}

export type CancellationOutcome =
  | { ok: true; outcome: "CANCELLED" | "REQUESTED" }
  | { ok: false; message: string };

/**
 * A customer asking to cancel.
 *
 * An unpaid booking is cancelled outright: no money has changed hands, so
 * there is nothing to refund and no reason to make anyone wait. Once a payment
 * has been taken the request goes to staff instead, because releasing the
 * venue and deciding what is refundable is governed by the conditions of hire,
 * not by the customer pressing a button.
 */
export async function requestCancellation(
  bookingId: string,
  actor: { id: string; email: string; fullName: string },
  reason: string,
): Promise<CancellationOutcome> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });

  if (booking.userId !== actor.id) {
    return { ok: false, message: "This booking belongs to someone else." };
  }
  if (
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.REJECTED
  ) {
    return { ok: false, message: "This booking is already cancelled." };
  }
  if (booking.cancellationRequestedAt) {
    return {
      ok: false,
      message: "A cancellation request is already with our team.",
    };
  }

  const paidCents = toCents(booking.amountPaid);

  if (paidCents === 0) {
    await cancelBooking(
      bookingId,
      actor,
      `Cancelled by the customer. ${reason}`.trim(),
    );
    return { ok: true, outcome: "CANCELLED" };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      cancellationRequestedAt: new Date(),
      cancellationRequestReason: reason,
    },
  });

  await recordAudit({
    actor: { id: actor.id, label: `${actor.fullName} <${actor.email}>` },
    action: "booking.cancellation_requested",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { reference: booking.reference, reason, paidCents },
  });

  await safely("cancellation request notice", () =>
    sendCancellationRequestEmail(bookingId),
  );

  return { ok: true, outcome: "REQUESTED" };
}

/** Staff declining a cancellation request, leaving the booking in place. */
export async function declineCancellationRequest(
  bookingId: string,
  actor: { id: string; email: string; fullName: string },
  reason: string,
) {
  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: { cancellationRequestedAt: null, cancellationRequestReason: null },
  });

  await recordAudit({
    actor: { id: actor.id, label: `${actor.fullName} <${actor.email}>` },
    action: "booking.cancellation_declined",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { reference: booking.reference, reason },
  });

  await safely("cancellation declined notice", () =>
    sendCancellationDeclinedEmail(bookingId, reason),
  );
  return booking;
}

/**
 * Record a payment received outside the gateways, typically an EFT against
 * the deposit balance, captured by the finance team.
 */
export async function recordManualPayment(
  bookingId: string,
  amountCents: number,
  actor: { id: string; email: string; fullName: string },
  note?: string,
) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      gateway: GatewayId.EFT,
      purpose:
        toCents(booking.amountPaid) > 0
          ? PaymentPurpose.BALANCE
          : PaymentPurpose.FULL,
      status: PaymentStatus.PENDING,
      amount: fromCents(amountCents),
      currency: booking.currency,
      reference: paymentReference(booking.reference),
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "manual.captured",
      verified: true,
      payload: { capturedBy: actor.email, note: note ?? null } as never,
    },
  });

  const outcome = await applySuccessfulPayment(payment.id);

  await recordAudit({
    actor: { id: actor.id, label: `${actor.fullName} <${actor.email}>` },
    action: "payment.manual_recorded",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { amountCents, note: note ?? null },
  });

  await dispatchPostConfirmation(outcome.bookingId, outcome.status, payment.id);
  return outcome;
}

/**
 * Settle the outstanding balance on a deposit booking by raising the amount
 * due to the full total. Called when finance requests final settlement.
 */
export async function requestBalanceSettlement(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
  });
  const totalCents = toCents(booking.total);
  if (toCents(booking.amountDue) >= totalCents) return booking;

  return prisma.booking.update({
    where: { id: bookingId },
    data: { amountDue: fromCents(totalCents) },
  });
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * Release bookings that were never paid for within the payment window, so
 * their slots return to the pool.
 */
export async function expireStalePayments(now: Date = new Date()): Promise<number> {
  const stale = await prisma.booking.findMany({
    where: {
      status: BookingStatus.PENDING_PAYMENT,
      reservations: {
        some: {
          status: ReservationStatus.PENDING_PAYMENT,
          holdExpiresAt: { lt: now },
        },
      },
    },
    select: { id: true, reference: true },
  });

  for (const booking of stale) {
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: "Payment not completed within the allowed time.",
        },
      }),
      prisma.reservation.updateMany({
        where: { bookingId: booking.id },
        data: { status: ReservationStatus.EXPIRED },
      }),
    ]);
  }

  return stale.length;
}
