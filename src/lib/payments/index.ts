import { GatewayId } from "@/generated/prisma/enums";
import { env } from "../env";
import { ikhokha } from "./ikhokha";
import { mock } from "./mock";
import { payfast } from "./payfast";
import { paystack } from "./paystack";
import { stripeGateway } from "./stripe";
import { yoco } from "./yoco";
import type { PaymentGateway } from "./types";

export * from "./types";

/**
 * Every supported provider. The RFP names PayFast, Yoco, Paystack and iKhokha
 * as the production integration path; Stripe and the simulated gateway serve
 * demonstration and development. The contract is open, so a further provider
 * is one adapter away.
 */
const REGISTRY: Partial<Record<GatewayId, PaymentGateway>> = {
  [GatewayId.PAYFAST]: payfast,
  [GatewayId.YOCO]: yoco,
  [GatewayId.PAYSTACK]: paystack,
  [GatewayId.IKHOKHA]: ikhokha,
  [GatewayId.STRIPE]: stripeGateway,
  [GatewayId.MOCK]: mock,
};

/** Gateways intended for live trading, as distinct from demonstration. */
export const PRODUCTION_GATEWAYS: GatewayId[] = [
  GatewayId.PAYFAST,
  GatewayId.YOCO,
  GatewayId.PAYSTACK,
  GatewayId.IKHOKHA,
];

export function getGateway(id: GatewayId): PaymentGateway {
  const gateway = REGISTRY[id];
  if (!gateway) {
    throw new Error(`No adapter registered for payment gateway ${id}`);
  }
  return gateway;
}

/** The gateway customers are currently checked out through. */
export function activeGateway(): PaymentGateway {
  const gateway = getGateway(env.PAYMENT_GATEWAY as GatewayId);
  if (!gateway.isConfigured()) {
    throw new Error(
      `Payment gateway ${gateway.displayName} is selected but not configured. ` +
        `Set its credentials, or switch PAYMENT_GATEWAY.`,
    );
  }
  return gateway;
}

/** Providers with credentials present, surfaced in the admin console. */
export function configuredGateways(): PaymentGateway[] {
  return Object.values(REGISTRY).filter((g): g is PaymentGateway =>
    Boolean(g?.isConfigured()),
  );
}

export { payfast, yoco, paystack, ikhokha, stripeGateway, mock };
