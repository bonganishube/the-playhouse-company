import { createHmac, timingSafeEqual } from "node:crypto";
import { GatewayId } from "@/generated/prisma/enums";
import { env } from "../env";
import {
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
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

  isConfigured() {
    return process.env.NODE_ENV !== "production";
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
};
