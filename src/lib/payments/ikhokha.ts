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
 * iKhokha — Payment Link API.
 *
 * Requests are authenticated with an application id header plus an IK-SIGN
 * signature: HMAC-SHA256, in hex, over the request path concatenated with the
 * exact JSON body, keyed by the application secret. The body must be signed
 * byte-for-byte as transmitted, so it is serialised once and reused.
 */

const API_HOST = "https://api.ikhokha.com";
const PAYMENT_PATH = "/public-api/v1/api/payment";

function sign(payload: string): string {
  return createHmac("sha256", env.IKHOKHA_APP_SECRET)
    .update(payload)
    .digest("hex");
}

export const ikhokha: PaymentGateway = {
  id: GatewayId.IKHOKHA,
  displayName: "iKhokha",

  isConfigured() {
    return Boolean(env.IKHOKHA_APP_ID && env.IKHOKHA_APP_SECRET);
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const body = JSON.stringify({
      entityID: request.reference,
      externalEntityID: request.bookingReference,
      amount: request.amountCents,
      currency: request.currency,
      requesterUrl: request.returnUrl,
      description: request.description.slice(0, 100),
      paymentReference: request.reference,
      mode: "live",
      externalTransactionID: request.reference,
      urls: {
        callbackUrl: request.notifyUrl,
        successPageUrl: request.returnUrl,
        failurePageUrl: request.cancelUrl,
        cancelUrl: request.cancelUrl,
      },
    });

    const response = await fetch(`${API_HOST}${PAYMENT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "IK-APPID": env.IKHOKHA_APP_ID,
        // Signed over path + body, exactly as sent.
        "IK-SIGN": sign(`${PAYMENT_PATH}${body}`),
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new GatewayError(
        `iKhokha payment link failed (${response.status}): ${detail}`,
        "ikhokha",
      );
    }

    const data = (await response.json()) as {
      paylinkUrl?: string;
      paylinkID?: string;
      responseCode?: string;
      message?: string;
    };

    if (!data.paylinkUrl) {
      throw new GatewayError(
        `iKhokha did not return a payment link: ${data.message ?? "unknown error"}`,
        "ikhokha",
      );
    }

    return {
      kind: "redirect",
      url: data.paylinkUrl,
      gatewayReference: data.paylinkID,
    };
  },

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const body = await request.text();
    let payload: IkhokhaCallback;
    try {
      payload = JSON.parse(body) as IkhokhaCallback;
    } catch {
      return { verified: false, reason: "Malformed JSON", status: "UNKNOWN", raw: body };
    }

    const base: WebhookResult = {
      verified: false,
      status: "UNKNOWN",
      reference: payload.externalTransactionID ?? payload.paymentReference,
      gatewayReference: payload.transactionID ?? payload.paylinkID,
      amountCents:
        typeof payload.amount === "number" ? payload.amount : undefined,
      raw: payload,
    };

    const provided = request.headers.get("ik-sign");
    if (!provided) {
      return { ...base, reason: "Missing IK-SIGN header" };
    }

    const expected = sign(body);
    const a = Buffer.from(provided.toLowerCase());
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ...base, reason: "Callback signature mismatch" };
    }

    return { ...base, verified: true, status: mapStatus(payload) };
  },
};

type IkhokhaCallback = {
  status?: string;
  responseCode?: string;
  amount?: number;
  transactionID?: string;
  paylinkID?: string;
  paymentReference?: string;
  externalTransactionID?: string;
};

function mapStatus(payload: IkhokhaCallback): WebhookStatus {
  const status = (payload.status ?? "").toLowerCase();
  if (status === "success" || status === "complete" || status === "paid") {
    return "SUCCEEDED";
  }
  if (status === "failed" || status === "declined") return "FAILED";
  if (status === "cancelled" || status === "canceled") return "CANCELLED";
  if (status === "pending" || status === "processing") return "PENDING";
  return "UNKNOWN";
}
