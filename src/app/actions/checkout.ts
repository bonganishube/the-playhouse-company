"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { PaymentPurpose } from "@/generated/prisma/enums";
import { getVerifiedSession, hashPassword } from "@/lib/auth";
import { createBookingFromCart, initiatePayment } from "@/lib/booking";
import { findCart, getOrCreateCart } from "@/lib/cart";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { RESET_TTL_MINUTES, requestPasswordReset } from "@/lib/passwordReset";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { randomBytes } from "node:crypto";

export type CheckoutState = {
  ok: boolean;
  message?: string;
  /**
   * Set when the only thing standing between the customer and their booking is
   * a sign-in, so the form can offer it in place of the message alone.
   */
  signIn?: { email: string };
};

const schema = z.object({
  contactName: z.string().min(2, "Enter the name of the person making the booking."),
  contactEmail: z.email("Enter a valid email address."),
  contactPhone: z.string().min(6, "Enter a contact telephone number."),
  organisation: z.string().optional(),
  eventTitle: z.string().optional(),
  purpose: z.string().optional(),
  payDeposit: z.boolean().default(false),
  acceptTerms: z.literal(true, {
    message: "You must accept the conditions of hire to proceed.",
  }),
});

/**
 * Turn the cart into a booking and hand the customer to the payment gateway.
 *
 * A guest checking out has an account created for them so the booking has an
 * owner and they can return to it later; they are signed in immediately and
 * can set a password afterwards via password reset.
 */
export async function checkoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = schema.safeParse({
    contactName: String(formData.get("contactName") ?? "").trim(),
    contactEmail: String(formData.get("contactEmail") ?? "").trim().toLowerCase(),
    contactPhone: String(formData.get("contactPhone") ?? "").trim(),
    organisation: String(formData.get("organisation") ?? "").trim() || undefined,
    eventTitle: String(formData.get("eventTitle") ?? "").trim() || undefined,
    purpose: String(formData.get("purpose") ?? "").trim() || undefined,
    // Absent when the cart has no deposit-eligible venue, in which case the
    // full amount is the only lawful outcome anyway. createBookingFromCart
    // re-checks the venues' payment policy regardless, so a forged value here
    // cannot buy a deposit the venue does not offer.
    payDeposit: formData.get("paymentAmount") === "deposit",
    acceptTerms: formData.get("acceptTerms") === "on" ? true : undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  const cart = await findCart();
  if (!cart) {
    return { ok: false, message: "Your cart is empty." };
  }

  // Identify the customer: the signed-in user, an existing account matching the
  // contact email, or a new account created for this booking.
  //
  // Verified against the database rather than trusted from the token. A signed,
  // unexpired JWT can still name a user who has since been deleted or
  // deactivated, and using that id would violate bookings_userId_fkey and fail
  // the checkout outright. Treating it as not signed in instead falls through
  // to the guest path below, which either recognises the account or creates
  // one.
  let session = await getVerifiedSession();
  if (!session) {
    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.contactEmail },
    });

    if (existing) {
      if (!existing.isActive) {
        return {
          ok: false,
          message:
            "An account exists for that email address but is not active. Please contact us.",
        };
      }
      // An existing account is never silently signed into from a guest form.
      // That would let anyone assume it by typing the address.
      //
      // The address is handed back so the form can offer a sign-in that
      // returns here with the cart intact. Telling someone to sign in and
      // leaving them to find their own way there loses the checkout they had
      // already filled in.
      return {
        ok: false,
        message: "An account already exists for that email address.",
        signIn: { email: parsed.data.contactEmail },
      };
    }

    const user = await prisma.user.create({
      data: {
        email: parsed.data.contactEmail,
        fullName: parsed.data.contactName,
        phone: parsed.data.contactPhone,
        organisation: parsed.data.organisation,
        // Unusable placeholder. The customer sets a real password through
        // /forgot-password, which is also how they first reach this account.
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      },
    });
    session = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    await createSession(session);
    await getOrCreateCart(user.id);

    // The account exists but has no password anyone knows, and the session
    // created above will not last forever. Send the link now rather than
    // leaving the customer to discover, once signed out, that they cannot get
    // back to their own booking. Failure here must not fail the checkout: the
    // booking is what they came for, and the link can be requested again.
    try {
      const issued = await requestPasswordReset(user.email);
      if (issued.issued) {
        await sendPasswordResetEmail(user.id, issued.issued.token, {
          firstTime: true,
          ttlMinutes: RESET_TTL_MINUTES,
        });
      }
    } catch (error) {
      console.error("[checkout] could not send password setup link", error);
    }
  }

  const created = await createBookingFromCart(
    cart.id,
    session.id,
    {
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
      organisation: parsed.data.organisation,
      eventTitle: parsed.data.eventTitle,
      purpose: parsed.data.purpose,
    },
    { payDeposit: parsed.data.payDeposit, termsVersion: CURRENT_TERMS_VERSION },
  );

  if (!created.ok) {
    return { ok: false, message: created.message };
  }

  // Hand off to the gateway.
  let destination: string;
  try {
    const { checkout } = await initiatePayment(
      created.bookingId,
      parsed.data.payDeposit ? PaymentPurpose.DEPOSIT : PaymentPurpose.FULL,
    );

    destination =
      checkout.kind === "redirect"
        ? checkout.url
        : // A signed form POST cannot be issued from a server action, so the
          // customer is routed via a page that submits it on their behalf.
          `/checkout/redirect/${created.reference}`;
  } catch (error) {
    console.error("[checkout] payment initiation failed", error);
    return {
      ok: false,
      message:
        "Your booking was created but the payment service could not be reached. " +
        `Quote reference ${created.reference} when contacting us.`,
    };
  }

  redirect(destination);
}
