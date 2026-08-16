import { createHmac, timingSafeEqual } from "node:crypto";
import { GatewayId } from "@/generated/prisma/enums";
import { env } from "../env";
import {
  GatewayError,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
  type WebhookResult,
  type WebhookStatus,
} from "./types";

/**
 * Paystack, hosted checkout.
 *
 * Checkout: POST /transaction/initialize returns an authorization_url.
 * Webhooks carry an x-paystack-signature header: HMAC-SHA512 of the raw body
 * under the secret key.
 */

const INITIALIZE_URL = "https://api.paystack.co/transaction/initialize";
const VERIFY_URL = "https://api.paystack.co/transaction/verify";

export const paystack: PaymentGateway = {
  id: GatewayId.PAYSTACK,
  displayName: "Paystack",

  isConfigured() {
    return Boolean(env.PAYSTACK_SECRET_KEY);
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const response = await fetch(INITIALIZE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: request.customerEmail,
        amount: request.amountCents,
        currency: request.currency,
        reference: request.reference,
        callback_url: request.returnUrl,
        metadata: {
          bookingReference: request.bookingReference,
          customerName: request.customerName,
          description: request.description,
          cancel_action: request.cancelUrl,
        },
      }),
    });

    const data = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: { authorization_url: string; reference: string };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new GatewayError(
        `Paystack initialisation failed: ${data.message ?? response.status}`,
        "paystack",
      );
    }

    return {
      kind: "redirect",
      url: data.data.authorization_url,
      gatewayReference: data.data.reference,
    };
  },

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const body = await request.text();
    let payload: PaystackWebhookPayload;
    try {
      payload = JSON.parse(body) as PaystackWebhookPayload;
    } catch {
      return { verified: false, reason: "Malformed JSON", status: "UNKNOWN", raw: body };
    }

    const base: WebhookResult = {
      verified: false,
      status: "UNKNOWN",
      reference: payload.data?.reference,
      gatewayReference: payload.data?.id ? String(payload.data.id) : undefined,
      amountCents: payload.data?.amount,
      raw: payload,
    };

    const provided = request.headers.get("x-paystack-signature");
    if (!provided) {
      return { ...base, reason: "Missing x-paystack-signature header" };
    }

    const expected = createHmac("sha512", env.PAYSTACK_SECRET_KEY)
      .update(body)
      .digest("hex");

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ...base, reason: "Webhook signature mismatch" };
    }

    return { ...base, verified: true, status: mapStatus(payload) };
  },
};

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    amount?: number;
    status?: string;
  };
};

function mapStatus(payload: PaystackWebhookPayload): WebhookStatus {
  const event = (payload.event ?? "").toLowerCase();
  const status = (payload.data?.status ?? "").toLowerCase();

  if (event === "charge.success" || status === "success") return "SUCCEEDED";
  if (event === "charge.failed" || status === "failed") return "FAILED";
  if (status === "abandoned") return "CANCELLED";
  if (status === "pending" || status === "ongoing") return "PENDING";
  return "UNKNOWN";
}

/**
 * Direct transaction lookup, used to reconcile a payment whose webhook was
 * never received (a customer who closed the tab, or a callback that failed).
 */
export async function verifyPaystackTransaction(
  reference: string,
): Promise<{ status: WebhookStatus; amountCents?: number; raw: unknown }> {
  const response = await fetch(`${VERIFY_URL}/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  const data = (await response.json()) as PaystackWebhookPayload & {
    status?: boolean;
  };
  return {
    status: mapStatus({ event: "verify", data: data.data }),
    amountCents: data.data?.amount,
    raw: data,
  };
}
