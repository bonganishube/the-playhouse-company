"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email/send";
import {
  RESET_TTL_MINUTES,
  consumePasswordReset,
  requestPasswordReset,
} from "@/lib/passwordReset";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export type PasswordState = { ok: boolean; message?: string; done?: boolean };

async function callerIp(): Promise<string | undefined> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    undefined
  );
}

/**
 * Ask for a reset link.
 *
 * The reply is identical whether or not the address is known. Confirming which
 * addresses have accounts would turn this form into a way of testing an email
 * list against the customer base, and the reassurance of a specific "no such
 * account" message is not worth that.
 */
export async function requestResetAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return { ok: false, message: "Enter the email address you booked with." };
  }

  const result = await requestPasswordReset(email, await callerIp());

  if (result.issued) {
    // Whether this account has ever had a usable password decides the wording.
    // Guest checkout stores a random one nobody knows, so those customers are
    // setting a password for the first time, not resetting a forgotten one.
    const user = await prisma.user.findUnique({
      where: { id: result.issued.userId },
      select: { bookings: { select: { id: true }, take: 1 } },
    });

    try {
      await sendPasswordResetEmail(result.issued.userId, result.issued.token, {
        firstTime: Boolean(user?.bookings.length),
        ttlMinutes: RESET_TTL_MINUTES,
      });
    } catch (error) {
      // Never surfaced to the browser: doing so would reveal that the address
      // exists. It is logged so a mail outage is still visible to us.
      console.error("[password] reset email failed to send", error);
    }
  }

  return {
    ok: true,
    done: true,
    message:
      "If an account exists for that address, a link to set a password is on its way. " +
      `It expires in ${RESET_TTL_MINUTES} minutes.`,
  };
}

/**
 * Redeem a link and set the password.
 *
 * The customer is signed in on success. They have just proved control of the
 * mailbox and chosen a password; making them type it again immediately adds
 * nothing.
 */
export async function resetPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password !== confirm) {
    return { ok: false, message: "The two passwords do not match." };
  }

  const result = await consumePasswordReset(token, password);
  if (!result.ok) return { ok: false, message: result.message };

  await createSession({
    id: result.userId,
    email: result.email,
    fullName: result.fullName,
    role: result.role as Role,
  });

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/account");
}
