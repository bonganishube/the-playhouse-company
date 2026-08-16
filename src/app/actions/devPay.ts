"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { signMockCallback } from "@/lib/payments/mock";

/**
 * Issue a signed callback from the simulated gateway.
 *
 * The callback is delivered over HTTP to the real webhook route so the
 * signature verification, settlement and confirmation paths under test are
 * exactly those a live gateway exercises.
 */
export async function simulatePaymentAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The simulated gateway is not available in production.");
  }

  const reference = String(formData.get("reference") ?? "");
  const amountCents = Number(formData.get("amountCents") ?? 0);
  const status = String(formData.get("status") ?? "SUCCEEDED");
  const returnUrl = String(formData.get("returnUrl") ?? "/");

  const body = JSON.stringify({ reference, amountCents, status });

  const response = await fetch(`${env.APP_URL}/api/payments/webhook/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-signature": signMockCallback(body),
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("[dev-pay] webhook rejected the callback", await response.text());
  }

  redirect(returnUrl);
}
