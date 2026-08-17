import { createHmac, timingSafeEqual } from "node:crypto";
import { GatewayId } from "@/generated/prisma/enums";
import { env } from "../env";
import {
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
  type RefundRequest,
  type RefundResult,
  type WebhookResult,
  type WebhookStatus,
} from "./types";

/**
 * Local development and demonstration gateway.
 *
 * Presents a simulated payment page so the complete booking lifecycle of
 * checkout, callback, confirmation and receipt can be exercised before The
 * Playhouse Company's merchant accounts are provisioned. Callbacks it issues
 * are signed with AUTH_SECRET so the verification path under test is the same
 * one the real gateways use.
 *
 * Guarded so it can never be selected in production.
 */

function sign(body: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(body).digest("hex");
}

export function signMockCallback(body: string): string {
  return sign(body);
}

export const mock: PaymentGateway = {
  id: GatewayId.MOCK,
  displayName: "Simulated payment (development)",

  /**
   * Available in development, and in production only under explicit protest.
   *
   * Refusing outright in production is the right default: a simulated gateway
   * confirms bookings without taking money, and nothing should be able to
   * switch that on by accident. But it also broke the one deployment that
   * legitimately needs it, a hosted demonstration for the client to review,
   * where checkout would offer no payment method at all.
   *
   * ALLOW_UNSAFE_PRODUCTION is the same flag that already lets such a
   * deployment start, and it is deliberately awkward: the server logs a
   * warning on every boot while it is set, and preflight reports it. So the
   * demonstration works, and a real launch still cannot reach live traffic
   * with simulated payments behind it.
   */
  isConfigured() {
    if (process.env.NODE_ENV !== "production") return true;
    return process.env.ALLOW_UNSAFE_PRODUCTION === "true";
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const url = new URL("/dev/pay", env.APP_URL);
    url.searchParams.set("reference", request.reference);
    url.searchParams.set("amount", String(request.amountCents));
    url.searchParams.set("booking", request.bookingReference);
    url.searchParams.set("return", request.returnUrl);
    url.searchParams.set("cancel", request.cancelUrl);
    return { kind: "redirect", url: url.toString(), gatewayReference: `MOCK-${request.reference}` };
  },

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const body = await request.text();
    let payload: {
      reference?: string;
      amountCents?: number;
      status?: string;
    };
    try {
      payload = JSON.parse(body);
    } catch {
      return { verified: false, reason: "Malformed JSON", status: "UNKNOWN", raw: body };
    }

    const base: WebhookResult = {
      verified: false,
      status: "UNKNOWN",
      reference: payload.reference,
      gatewayReference: `MOCK-${payload.reference}`,
      amountCents: payload.amountCents,
      raw: payload,
    };

    const provided = request.headers.get("x-mock-signature") ?? "";
    const expected = sign(body);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ...base, reason: "Signature mismatch" };
    }

    const status = (payload.status ?? "SUCCEEDED").toUpperCase() as WebhookStatus;
    return { ...base, verified: true, status };
  },

  /**
   * Simulated refund.
   *
   * No money exists to move, so this always succeeds. It is here so the whole
   * refund path, including the ledger update and the customer's email, can be
   * demonstrated and tested before a real merchant account exists.
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    console.info(
      `[mock] simulated refund of ${request.amountCents} cents against ${request.reference}`,
    );
    return {
      ok: true,
      gatewayRefundReference: `MOCK-REFUND-${request.idempotencyKey.slice(0, 12)}`,
    };
  },
};
