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

export type GatewayOption = {
  id: GatewayId;
  name: string;
  /** One line explaining what it is, shown beneath the name. */
  summary: string;
  /** True when it can actually take a payment right now. */
  available: boolean;
  /** Why it cannot be selected, when it cannot. */
  unavailableReason?: string;
  /** The one payments are currently routed through. */
  active: boolean;
};

const CATALOGUE: Record<string, { name: string; summary: string }> = {
  [GatewayId.PAYFAST]: {
    name: "PayFast",
    summary: "Card, Instant EFT, SnapScan and Mobicred",
  },
  [GatewayId.YOCO]: {
    name: "Yoco",
    summary: "Card payments, South African acquirer",
  },
  [GatewayId.PAYSTACK]: {
    name: "Paystack",
    summary: "Card and bank transfer",
  },
  [GatewayId.IKHOKHA]: {
    name: "iKhokha",
    summary: "Card and payment links",
  },
  [GatewayId.STRIPE]: {
    name: "Stripe",
    summary: "Demonstration and development only",
  },
  [GatewayId.MOCK]: {
    name: "Simulated payment",
    summary: "Demonstration only. No money changes hands",
  },
};

/**
 * Every gateway a customer could be offered, with its current availability.
 *
 * The four named in the RFP are always listed, even before their merchant
 * accounts exist, so the checkout shows the intended providers rather than
 * hiding them until go-live. They are presented as unavailable rather than
 * omitted, which is both honest to the customer and useful in demonstration.
 */
export function gatewayCatalogue(): GatewayOption[] {
  const activeId = env.PAYMENT_GATEWAY as GatewayId;

  const ids: GatewayId[] = [...PRODUCTION_GATEWAYS];
  // Whatever is actually taking payments is shown too, if it is not already
  // one of the production four.
  if (!ids.includes(activeId)) ids.push(activeId);

  return ids.map((id) => {
    const meta = CATALOGUE[id] ?? { name: id, summary: "" };
    const gateway = REGISTRY[id];
    const configured = Boolean(gateway?.isConfigured());
    const active = id === activeId;

    return {
      id,
      name: meta.name,
      summary: meta.summary,
      available: active && configured,
      unavailableReason: active
        ? undefined
        : configured
          ? "Configured but not currently in use"
          : "Awaiting a merchant account",
      active,
    };
  });
}

export { payfast, yoco, paystack, ikhokha, stripeGateway, mock };

/** Whether a provider can send money back through its API. */
export function gatewaySupportsRefund(id: GatewayId): boolean {
  return typeof REGISTRY[id]?.refund === "function";
}
