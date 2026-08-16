import Stripe from "stripe";
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
 * Stripe — demonstration and development gateway.
 *
 * Scope: Stripe test mode requires no merchant onboarding, so the complete
 * payment lifecycle can be demonstrated immediately. The production
 * integration path remains the gateways named in the RFP (PayFast, Yoco,
 * Paystack, iKhokha), which settle to The Playhouse Company's state-registered
 * merchant accounts. Switching is a configuration change, not a rewrite.
 *
 * Unlike the other adapters this one uses Stripe's official SDK rather than
 * raw fetch. Signature verification is the part of a payment integration most
 * likely to be subtly wrong, and this is the gateway that will actually be
 * exercised, so the vendor's own implementation is used for it.
 */

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new GatewayError("Stripe is not configured", "stripe");
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    // Pinned so a Stripe-side API change cannot alter behaviour unannounced.
    // Must match the version the installed SDK is generated against; bump both
    // together when upgrading.
    apiVersion: "2026-07-29.dahlia",
    appInfo: {
      name: "The Playhouse Company — Venue Booking Platform",
    },
  });
  return client;
}

export const stripeGateway: PaymentGateway = {
  id: GatewayId.STRIPE,
  displayName: "Stripe (demonstration)",

  isConfigured() {
    return Boolean(env.STRIPE_SECRET_KEY);
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    try {
      const session = await stripe().checkout.sessions.create(
        {
          mode: "payment",
          success_url: request.returnUrl,
          cancel_url: request.cancelUrl,
          customer_email: request.customerEmail,
          // Echoed back on the webhook, and how we find the session again.
          client_reference_id: request.reference,
          metadata: {
            paymentReference: request.reference,
            bookingReference: request.bookingReference,
            customerName: request.customerName,
          },
          payment_intent_data: {
            description: `${request.description} — ${request.bookingReference}`,
            metadata: {
              paymentReference: request.reference,
              bookingReference: request.bookingReference,
            },
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: request.currency.toLowerCase(),
                unit_amount: request.amountCents,
                product_data: {
                  name: request.description.slice(0, 250),
                  description: `Booking ${request.bookingReference}`,
                },
              },
            },
          ],
          // Abandoned sessions should lapse well inside our payment window.
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        },
        // Makes a retried checkout safe to submit twice.
        { idempotencyKey: request.reference },
      );

      if (!session.url) {
        throw new GatewayError("Stripe returned no checkout URL", "stripe");
      }

      return {
        kind: "redirect",
        url: session.url,
        gatewayReference: session.id,
      };
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(
        `Stripe checkout failed: ${error instanceof Error ? error.message : String(error)}`,
        "stripe",
        error,
      );
    }
  },

  async handleWebhook(request: Request): Promise<WebhookResult> {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!env.STRIPE_WEBHOOK_SECRET) {
      return {
        verified: false,
        reason: "No Stripe webhook secret configured",
        status: "UNKNOWN",
        raw: body,
      };
    }
    if (!signature) {
      return {
        verified: false,
        reason: "Missing stripe-signature header",
        status: "UNKNOWN",
        raw: body,
      };
    }

    let event: Stripe.Event;
    try {
      // Verifies the HMAC and enforces Stripe's replay tolerance.
      event = await stripe().webhooks.constructEventAsync(
        body,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      return {
        verified: false,
        reason: `Signature verification failed: ${error instanceof Error ? error.message : "unknown"}`,
        status: "UNKNOWN",
        raw: body,
      };
    }

    return interpret(event, event.data.object);
  },

  async reconcile(gatewayReference: string): Promise<WebhookResult> {
    try {
      const session = await stripe().checkout.sessions.retrieve(gatewayReference);
      return {
        // Authenticated server-to-server call — the response is trustworthy.
        verified: true,
        status: sessionStatus(session),
        reference:
          session.client_reference_id ??
          session.metadata?.paymentReference ??
          undefined,
        gatewayReference: session.id,
        amountCents: session.amount_total ?? undefined,
        raw: { source: "reconcile", session },
      };
    } catch (error) {
      return {
        verified: false,
        reason: `Stripe lookup failed: ${error instanceof Error ? error.message : "unknown"}`,
        status: "UNKNOWN",
        raw: { gatewayReference },
      };
    }
  },
};

/** Map a verified Stripe event onto our provider-neutral result. */
function interpret(event: Stripe.Event, object: unknown): WebhookResult {
  const base = {
    verified: true as const,
    raw: event,
  };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = object as Stripe.Checkout.Session;
      return {
        ...base,
        status: sessionStatus(session),
        reference:
          session.client_reference_id ??
          session.metadata?.paymentReference ??
          undefined,
        gatewayReference: session.id,
        amountCents: session.amount_total ?? undefined,
      };
    }

    case "payment_intent.payment_failed": {
      const intent = object as Stripe.PaymentIntent;
      return {
        ...base,
        status: "FAILED",
        reason: intent.last_payment_error?.message,
        reference: intent.metadata?.paymentReference,
        gatewayReference: intent.id,
        amountCents: intent.amount,
      };
    }

    default:
      // Stripe sends many event types; anything we do not act on is recorded
      // to the audit trail and acknowledged without changing booking state.
      return {
        ...base,
        status: "UNKNOWN",
        reason: `Unhandled event type ${event.type}`,
      };
  }
}

function sessionStatus(session: Stripe.Checkout.Session): WebhookStatus {
  if (session.status === "expired") return "CANCELLED";

  switch (session.payment_status) {
    case "paid":
    case "no_payment_required":
      return "SUCCEEDED";
    case "unpaid":
      // An open session is still in progress; a completed one that is unpaid
      // means the payment did not succeed.
      return session.status === "complete" ? "FAILED" : "PENDING";
    default:
      return "UNKNOWN";
  }
}
