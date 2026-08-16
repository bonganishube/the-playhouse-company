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
 * Yoco — hosted Checkout API.
 *
 * Checkout: POST /checkouts returns a redirectUrl for the customer.
 * Webhooks are signed in the Standard Webhooks format: the signed content is
 * "{id}.{timestamp}.{body}", HMAC-SHA256 under the base64 secret that follows
 * the "whsec_" prefix.
 */

const CHECKOUTS_URL = "https://payments.yoco.com/api/checkouts";
/** Reject callbacks older than this to blunt replay attempts. */
const MAX_WEBHOOK_AGE_SECONDS = 300;

export const yoco: PaymentGateway = {
  id: GatewayId.YOCO,
  displayName: "Yoco",

  isConfigured() {
    return Boolean(env.YOCO_SECRET_KEY);
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const response = await fetch(CHECKOUTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.YOCO_SECRET_KEY}`,
        "Content-Type": "application/json",
        // Makes a retried checkout safe to submit twice.
        "Idempotency-Key": request.reference,
      },
      body: JSON.stringify({
        amount: request.amountCents,
        currency: request.currency,
        successUrl: request.returnUrl,
        cancelUrl: request.cancelUrl,
        failureUrl: request.cancelUrl,
        externalId: request.reference,
        metadata: {
          bookingReference: request.bookingReference,
          paymentReference: request.reference,
          customerEmail: request.customerEmail,
        },
        lineItems: [
          {
            displayName: request.description.slice(0, 100),
            quantity: 1,
            pricingDetails: { price: request.amountCents },
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new GatewayError(
        `Yoco checkout failed (${response.status}): ${detail}`,
        "yoco",
      );
    }

    const data = (await response.json()) as {
      id: string;
      redirectUrl: string;
    };
    if (!data.redirectUrl) {
      throw new GatewayError("Yoco did not return a redirect URL", "yoco");
    }

    return { kind: "redirect", url: data.redirectUrl, gatewayReference: data.id };
  },

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const body = await request.text();
    let payload: YocoWebhookPayload;
    try {
      payload = JSON.parse(body) as YocoWebhookPayload;
    } catch {
      return { verified: false, reason: "Malformed JSON", status: "UNKNOWN", raw: body };
    }

    const reference =
      payload.payload?.metadata?.paymentReference ??
      payload.payload?.externalId ??
      undefined;

    const base: WebhookResult = {
      verified: false,
      status: "UNKNOWN",
      reference,
      gatewayReference: payload.payload?.id ?? payload.id,
      amountCents: payload.payload?.amount,
      raw: payload,
    };

    if (!env.YOCO_WEBHOOK_SECRET) {
      return { ...base, reason: "No Yoco webhook secret configured" };
    }

    const id = request.headers.get("webhook-id");
    const timestamp = request.headers.get("webhook-timestamp");
    const signatureHeader = request.headers.get("webhook-signature");
    if (!id || !timestamp || !signatureHeader) {
      return { ...base, reason: "Missing webhook signature headers" };
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > MAX_WEBHOOK_AGE_SECONDS) {
      return { ...base, reason: "Webhook timestamp outside tolerance" };
    }

    const secret = Buffer.from(
      env.YOCO_WEBHOOK_SECRET.replace(/^whsec_/, ""),
      "base64",
    );
    const expected = createHmac("sha256", secret)
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");

    // The header carries a space-separated list of "v1,<signature>" entries.
    const provided = signatureHeader
      .split(" ")
      .map((part) => part.split(",")[1])
      .filter((v): v is string => Boolean(v));

    const matches = provided.some((candidate) => safeEqual(candidate, expected));
    if (!matches) {
      return { ...base, reason: "Webhook signature mismatch" };
    }

    return { ...base, verified: true, status: mapStatus(payload) };
  },
};

type YocoWebhookPayload = {
  id?: string;
  type?: string;
  payload?: {
    id?: string;
    status?: string;
    amount?: number;
    externalId?: string;
    metadata?: Record<string, string>;
  };
};

function mapStatus(payload: YocoWebhookPayload): WebhookStatus {
  const type = (payload.type ?? "").toLowerCase();
  const status = (payload.payload?.status ?? "").toLowerCase();

  if (type.includes("succeeded") || status === "succeeded") return "SUCCEEDED";
  if (type.includes("failed") || status === "failed") return "FAILED";
  if (status === "cancelled" || status === "canceled") return "CANCELLED";
  if (status === "pending" || status === "created") return "PENDING";
  return "UNKNOWN";
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
