import { createHash } from "node:crypto";
import { GatewayId } from "@/generated/prisma/enums";
import { env } from "../env";
import {
  centsToDecimalString,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentGateway,
  type WebhookResult,
  type WebhookStatus,
} from "./types";

/**
 * PayFast.
 *
 * Integration style: a signed form POST to PayFast's process endpoint, with
 * confirmation delivered server-to-server as an Instant Transaction
 * Notification (ITN).
 *
 * An ITN is only trusted after all four of PayFast's prescribed checks pass:
 *   1. the MD5 signature recomputes correctly,
 *   2. the request originates from a published PayFast host,
 *   3. the amount matches what we asked for (checked by the caller),
 *   4. PayFast itself confirms the payload via a server-side validation post.
 */

const LIVE_PROCESS = "https://www.payfast.co.za/eng/process";
const SANDBOX_PROCESS = "https://sandbox.payfast.co.za/eng/process";
const LIVE_VALIDATE = "https://www.payfast.co.za/eng/query/validate";
const SANDBOX_VALIDATE = "https://sandbox.payfast.co.za/eng/query/validate";

const VALID_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

/**
 * PayFast signs the parameters in the order they were submitted, URL-encoded
 * with uppercase percent escapes and spaces as "+". Deviating from this
 * encoding is the usual cause of signature mismatches.
 */
function payfastEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function signature(
  fields: Record<string, string>,
  passphrase: string,
  order?: string[],
): string {
  const keys = order ?? Object.keys(fields);
  const query = keys
    .filter((k) => k !== "signature" && fields[k] !== undefined && fields[k] !== "")
    .map((k) => `${k}=${payfastEncode(fields[k]!)}`)
    .join("&");
  const withPassphrase = passphrase
    ? `${query}&passphrase=${payfastEncode(passphrase)}`
    : query;
  return createHash("md5").update(withPassphrase).digest("hex");
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1)! };
}

export const payfast: PaymentGateway = {
  id: GatewayId.PAYFAST,
  displayName: "PayFast",

  isConfigured() {
    return Boolean(env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY);
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const { first, last } = splitName(request.customerName);

    // Field order matters — this is the order signed and submitted.
    const fields: Record<string, string> = {
      merchant_id: env.PAYFAST_MERCHANT_ID,
      merchant_key: env.PAYFAST_MERCHANT_KEY,
      return_url: request.returnUrl,
      cancel_url: request.cancelUrl,
      notify_url: request.notifyUrl,
      name_first: first,
      name_last: last,
      email_address: request.customerEmail,
      m_payment_id: request.reference,
      amount: centsToDecimalString(request.amountCents),
      item_name: request.description.slice(0, 100),
      item_description: `Booking ${request.bookingReference}`.slice(0, 255),
    };

    fields.signature = signature(fields, env.PAYFAST_PASSPHRASE);

    return {
      kind: "form_post",
      url: env.PAYFAST_SANDBOX ? SANDBOX_PROCESS : LIVE_PROCESS,
      fields,
    };
  },

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const payload: Record<string, string> = {};
    for (const [k, v] of params.entries()) payload[k] = v;

    const base: WebhookResult = {
      verified: false,
      status: "UNKNOWN",
      reference: payload.m_payment_id,
      gatewayReference: payload.pf_payment_id,
      amountCents: payload.amount_gross
        ? Math.round(Number(payload.amount_gross) * 100)
        : undefined,
      raw: payload,
    };

    // 1. Signature — recomputed over the fields in the order received.
    const received = payload.signature ?? "";
    const expected = signature(
      payload,
      env.PAYFAST_PASSPHRASE,
      [...params.keys()],
    );
    if (received !== expected) {
      return { ...base, reason: "ITN signature mismatch" };
    }

    // 2. Source host.
    const host = request.headers.get("host") ?? "";
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const originOk = await isPayFastHost(forwarded, host);
    if (!originOk) {
      return { ...base, reason: "ITN did not originate from a PayFast host" };
    }

    // 3. Server-side confirmation with PayFast.
    const confirmed = await validateWithPayFast(body);
    if (!confirmed) {
      return { ...base, reason: "PayFast did not validate the ITN payload" };
    }

    return {
      ...base,
      verified: true,
      status: mapStatus(payload.payment_status),
    };
  },
};

function mapStatus(status: string | undefined): WebhookStatus {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETE":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "PENDING":
      return "PENDING";
    default:
      return "UNKNOWN";
  }
}

/**
 * Resolve PayFast's published hostnames and confirm the caller is one of them.
 * DNS is consulted at request time so PayFast can rotate addresses without a
 * redeployment on our side.
 */
async function isPayFastHost(
  forwardedFor: string,
  _host: string,
): Promise<boolean> {
  const candidate = forwardedFor.split(",")[0]?.trim();
  if (!candidate) return false;

  const { promises: dns } = await import("node:dns");
  const resolved = await Promise.all(
    VALID_HOSTS.map(async (h) => {
      try {
        return await dns.resolve4(h);
      } catch {
        return [] as string[];
      }
    }),
  );
  return resolved.flat().includes(candidate);
}

async function validateWithPayFast(body: string): Promise<boolean> {
  const url = env.PAYFAST_SANDBOX ? SANDBOX_VALIDATE : LIVE_VALIDATE;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = (await response.text()).trim();
    return text.startsWith("VALID");
  } catch (error) {
    console.error("[payfast] validation request failed", error);
    return false;
  }
}
