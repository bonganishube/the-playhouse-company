"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PaymentPurpose } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { initiatePayment, requestCancellation } from "@/lib/booking";
import { prisma } from "@/lib/prisma";

export type BookingActionState = { ok: boolean; message?: string };

/**
 * Settle whatever is still owed on a booking.
 *
 * Distinct from the checkout payment: a deposit booking is already confirmed
 * and its upfront requirement met, so the amount collected here is the
 * remainder of the total rather than the amount that was due at the time.
 */
export async function payBalanceAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const reference = String(formData.get("reference") ?? "");
  const user = await requireUser();

  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: { id: true, userId: true, status: true },
  });
  if (!booking || booking.userId !== user.id) {
    return { ok: false, message: "Booking not found." };
  }
  if (booking.status === "CANCELLED" || booking.status === "REJECTED") {
    return { ok: false, message: "This booking is no longer active." };
  }

  let destination: string;
  try {
    const { checkout } = await initiatePayment(
      booking.id,
      PaymentPurpose.BALANCE,
    );
    destination =
      checkout.kind === "redirect"
        ? checkout.url
        : `/checkout/redirect/${reference}`;
  } catch (error) {
    console.error("[booking] balance payment failed to start", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The payment service could not be reached.",
    };
  }

  redirect(destination);
}

/**
 * Ask to cancel.
 *
 * An unpaid booking is cancelled immediately. Once money has been taken the
 * request goes to staff, because releasing the venue and deciding what is
 * refundable is governed by the conditions of hire.
 */
export async function requestCancellationAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const reference = String(formData.get("reference") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason.length < 3) {
    return { ok: false, message: "Please tell us briefly why you are cancelling." };
  }

  const user = await requireUser();
  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: { id: true },
  });
  if (!booking) return { ok: false, message: "Booking not found." };

  const result = await requestCancellation(booking.id, user, reason);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath(`/booking/${reference}`);
  revalidatePath("/account");

  return {
    ok: true,
    message:
      result.outcome === "CANCELLED"
        ? "Your booking has been cancelled and the dates released."
        : "Your request is with our venue management team. We will write to you once a decision has been made.",
  };
}
