import { PaymentStatus } from "@/generated/prisma/enums";
import { sendRefundIssuedEmail } from "./email/send";
import { formatCents, toCents } from "./money";
import { getGateway } from "./payments";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

/**
 * Refunds.
 *
 * The booking flow has always told customers that a rejected booking is
 * refunded in full, and the cart repeats the promise. Until now nothing
 * carried it out, so the ledger said a booking was paid while the money had
 * been sent back by hand, or worse had not been sent at all. This closes that
 * gap.
 *
 * Two routes, both recorded identically:
 *
 *   automatic  the provider exposes refunds to the API and we call it
 *   manual     it does not, so finance moves the money and records it here
 *
 * The second is not a lesser case. EFT payments and providers without a refund
 * API are ordinary, and a refund carried out in a bank portal still has to
 * reach the customer's ledger or the outstanding balance will be wrong.
 */

export type RefundOutcome =
  | { ok: true; refundedCents: number; manual: boolean; message: string }
  | { ok: false; message: string };

/** What is still refundable on a payment, in cents. */
export function refundableCents(payment: {
  amount: unknown;
  refundedAmount: unknown;
  status: PaymentStatus;
}): number {
  if (payment.status !== PaymentStatus.SUCCEEDED && payment.status !== PaymentStatus.REFUNDED) {
    return 0;
  }
  const paid = toCents(payment.amount as never);
  const already = payment.refundedAmount ? toCents(payment.refundedAmount as never) : 0;
  return Math.max(0, paid - already);
}

/**
 * Refund all or part of a payment.
 *
 * `manual` forces the record-only route, for money already moved outside the
 * system. Without it the provider's API is used when available, and the manual
 * route is the fallback rather than a silent failure.
 */
export async function refundPayment(
  paymentId: string,
  options: {
    amountCents: number;
    reason: string;
    actor: SessionUser;
    manual?: boolean;
    /** Suppress the customer email, e.g. when a covering letter is being sent. */
    notify?: boolean;
  },
): Promise<RefundOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });
  if (!payment) return { ok: false, message: "Payment not found." };

  const available = refundableCents(payment);
  if (available <= 0) {
    return {
      ok: false,
      message:
        payment.status === PaymentStatus.SUCCEEDED
          ? "This payment has already been refunded in full."
          : `A payment with status ${payment.status} cannot be refunded.`,
    };
  }

  const amountCents = Math.round(options.amountCents);
  if (amountCents <= 0) {
    return { ok: false, message: "Enter an amount greater than zero." };
  }
  if (amountCents > available) {
    return {
      ok: false,
      message: `Only ${formatCents(available, payment.currency)} remains refundable on this payment.`,
    };
  }

  const gateway = getGateway(payment.gateway);
  const canAutomate = Boolean(gateway.refund) && !options.manual;

  // The key is derived from the payment and the running refunded total, so a
  // resubmitted form produces the same key and the provider can recognise the
  // repeat rather than paying twice.
  const idempotencyKey = `${payment.id}-${toCents(payment.refundedAmount ?? (0 as never))}-${amountCents}`;

  let gatewayRefundReference: string | undefined;
  const manual = !canAutomate;

  if (canAutomate) {
    try {
      const result = await gateway.refund!({
        gatewayReference: payment.gatewayReference ?? payment.reference,
        reference: payment.reference,
        amountCents,
        currency: payment.currency,
        reason: options.reason,
        idempotencyKey,
      });

      if (!result.ok) {
        // Refused by the provider. Nothing is recorded, because recording a
        // refund that did not happen is worse than reporting the failure.
        await recordEvent(payment.id, "refund.failed", {
          amountCents,
          reason: options.reason,
          message: result.message,
        });
        return {
          ok: false,
          message:
            result.message ??
            `${gateway.displayName} refused the refund. Record it manually once settled another way.`,
        };
      }
      gatewayRefundReference = result.gatewayRefundReference;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordEvent(payment.id, "refund.failed", { amountCents, message });
      return {
        ok: false,
        message: `${gateway.displayName} could not be reached: ${message}`,
      };
    }
  }

  const alreadyRefunded = payment.refundedAmount ? toCents(payment.refundedAmount) : 0;
  const totalRefunded = alreadyRefunded + amountCents;
  const fullyRefunded = totalRefunded >= toCents(payment.amount);

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: (totalRefunded / 100).toFixed(2),
        refundedAt: new Date(),
        // A partial refund leaves the payment succeeded: it did succeed, and
        // some of it stands. Only a full reversal changes what the payment is.
        status: fullyRefunded ? PaymentStatus.REFUNDED : payment.status,
      },
    });

    // The booking's paid total must fall by the same amount, or the balance
    // owing and every revenue report will overstate what was collected.
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: payment.bookingId },
    });
    const newPaid = Math.max(0, toCents(booking.amountPaid) - amountCents);
    await tx.booking.update({
      where: { id: booking.id },
      data: { amountPaid: (newPaid / 100).toFixed(2) },
    });

    await tx.paymentEvent.create({
      data: {
        paymentId: payment.id,
        type: manual ? "refund.recorded_manually" : "refund.issued",
        verified: !manual,
        payload: {
          amountCents,
          reason: options.reason,
          gatewayRefundReference: gatewayRefundReference ?? null,
          actor: options.actor.email,
          totalRefundedCents: totalRefunded,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: options.actor.id,
        actorLabel: options.actor.email,
        action: manual ? "payment.refund_recorded" : "payment.refunded",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          bookingReference: payment.booking.reference,
          amountCents,
          reason: options.reason,
        },
      },
    });
  });

  if (options.notify !== false) {
    try {
      await sendRefundIssuedEmail(payment.id, amountCents, options.reason, manual);
    } catch (error) {
      // The money has moved and the ledger is right; a failed notification is
      // recoverable from the correspondence panel and must not undo that.
      console.error("[refund] notification failed", error);
    }
  }

  return {
    ok: true,
    refundedCents: amountCents,
    manual,
    message: manual
      ? `${formatCents(amountCents, payment.currency)} recorded as refunded. Settle it with the customer directly.`
      : `${formatCents(amountCents, payment.currency)} refunded through ${gateway.displayName}.`,
  };
}

async function recordEvent(paymentId: string, type: string, payload: unknown) {
  await prisma.paymentEvent.create({
    data: { paymentId, type, verified: false, payload: payload as never },
  });
}

/**
 * Refund everything collected on a booking.
 *
 * Used when a booking is rejected, where the promise made to the customer is a
 * full refund rather than a judgement about how much to return. Each payment
 * is handled separately because they may have gone through different
 * providers, and one failing must not stop the others.
 */
export async function refundBookingInFull(
  bookingId: string,
  reason: string,
  actor: SessionUser,
): Promise<{ refundedCents: number; failures: string[]; manualCount: number }> {
  const payments = await prisma.payment.findMany({
    where: { bookingId, status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] } },
    orderBy: { createdAt: "asc" },
  });

  let refundedCents = 0;
  let manualCount = 0;
  const failures: string[] = [];

  for (const payment of payments) {
    const outstanding = refundableCents(payment);
    if (outstanding <= 0) continue;

    const result = await refundPayment(payment.id, {
      amountCents: outstanding,
      reason,
      actor,
      // One message covers the whole booking, sent by the caller.
      notify: false,
    });

    if (result.ok) {
      refundedCents += result.refundedCents;
      if (result.manual) manualCount += 1;
    } else {
      failures.push(`${payment.reference}: ${result.message}`);
    }
  }

  return { refundedCents, failures, manualCount };
}
