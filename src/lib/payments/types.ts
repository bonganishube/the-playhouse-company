import type { GatewayId } from "@/generated/prisma/enums";

/**
 * A single contract every payment provider is adapted to, so the checkout and
 * reconciliation flows contain no provider-specific branching. Adding a
 * gateway means adding one file and registering it.
 */

export type CheckoutRequest = {
  /** Our payment reference, echoed back by the gateway for reconciliation. */
  reference: string;
  amountCents: number;
  currency: string;
  description: string;

  bookingReference: string;
  customerName: string;
  customerEmail: string;

  /** Where the customer lands after a successful payment. */
  returnUrl: string;
  /** Where the customer lands if they abandon the payment. */
  cancelUrl: string;
  /** Server-to-server callback that actually confirms the booking. */
  notifyUrl: string;
};

/**
 * How the customer is handed to the provider. PayFast requires a signed form
 * POST; the others return a hosted-checkout URL to redirect to.
 */
export type CheckoutResult =
  | { kind: "redirect"; url: string; gatewayReference?: string }
  | {
      kind: "form_post";
      url: string;
      fields: Record<string, string>;
      gatewayReference?: string;
    };

export type WebhookStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "PENDING"
  | "CANCELLED"
  | "UNKNOWN";

export type WebhookResult = {
  /** Whether the payload's authenticity was cryptographically established. */
  verified: boolean;
  /** Why verification failed, for the audit trail. */
  reason?: string;
  status: WebhookStatus;
  /** Our reference, recovered from the payload. */
  reference?: string;
  /** The provider's transaction identifier. */
  gatewayReference?: string;
  /** Amount the provider says was settled, for a tamper check. */
  amountCents?: number;
  raw: unknown;
};

export interface PaymentGateway {
  readonly id: GatewayId;
  readonly displayName: string;
  /** False when credentials are absent, checkout must not be offered. */
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /**
   * Verify and interpret an inbound provider callback. Implementations must
   * treat an unverifiable payload as untrusted and never report SUCCEEDED
   * for it.
   */
  handleWebhook(request: Request): Promise<WebhookResult>;
  /**
   * Ask the provider directly what happened to a transaction.
   *
   * Webhooks get lost, a deploy mid-flight, an outage, a misconfigured
   * endpoint. And a customer whose payment succeeded should not be left with
   * an unconfirmed booking. Where a provider supports lookup, this closes that
   * gap: it is called when the customer returns from the payment page, and can
   * also be driven from the maintenance sweep.
   *
   * The result is authenticated by the outbound API call itself, so
   * implementations return verified: true.
   */
  reconcile?(gatewayReference: string): Promise<WebhookResult>;
  /**
   * Send money back to the customer.
   *
   * Optional, because not every provider exposes refunds to the API and some
   * merchant accounts disable them. Where it is absent the refund is still
   * recorded against the payment and carried out by finance through the
   * provider's own dashboard or by transfer, so the customer's ledger is right
   * either way. What must never happen is the booking claiming a refund the
   * system neither made nor recorded.
   *
   * Implementations must be safe to call twice with the same
   * idempotencyKey: a refund issued twice is money lost.
   */
  refund?(request: RefundRequest): Promise<RefundResult>;
}

export type RefundRequest = {
  /** The provider's identifier for the original transaction. */
  gatewayReference: string;
  /** Our reference for the original payment. */
  reference: string;
  amountCents: number;
  currency: string;
  reason: string;
  /** Stable per refund attempt, so a retry cannot pay twice. */
  idempotencyKey: string;
};

export type RefundResult = {
  ok: boolean;
  /** The provider's identifier for the refund itself. */
  gatewayRefundReference?: string;
  /** Why it was refused, for the audit trail and the operator. */
  message?: string;
};

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly gateway: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/** Amount in cents rendered as the decimal string PayFast expects. */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}
