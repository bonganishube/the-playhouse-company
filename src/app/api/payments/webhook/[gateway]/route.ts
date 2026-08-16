import { NextResponse } from "next/server";
import { GatewayId } from "@/generated/prisma/enums";
import { settlePayment } from "@/lib/booking";
import { getGateway } from "@/lib/payments";

/**
 * Inbound gateway callbacks.
 *
 * This is the endpoint that actually confirms a booking — the customer's
 * return to the site is only cosmetic, since a browser redirect can be lost,
 * replayed or forged.
 *
 * Responses are deliberately 200 for anything we have durably recorded, even
 * when the payload is rejected: gateways retry non-2xx responses indefinitely,
 * and an unverifiable payload will never become verifiable on a retry. Genuine
 * transient failures (a database outage) return 500 so the retry is useful.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gateway: string }> },
) {
  const { gateway: slug } = await params;
  const gatewayId = slug.toUpperCase() as GatewayId;

  if (!Object.values(GatewayId).includes(gatewayId)) {
    return NextResponse.json({ error: "Unknown gateway" }, { status: 404 });
  }

  let gateway;
  try {
    gateway = getGateway(gatewayId);
  } catch {
    return NextResponse.json({ error: "Unknown gateway" }, { status: 404 });
  }

  if (!gateway.isConfigured()) {
    return NextResponse.json(
      { error: "Gateway not configured" },
      { status: 503 },
    );
  }

  const sourceIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined;

  try {
    const result = await gateway.handleWebhook(request);
    const outcome = await settlePayment(gatewayId, result, sourceIp);

    if (!outcome.handled) {
      console.warn(
        `[webhook:${slug}] not applied — ${outcome.reason ?? "unknown reason"}`,
      );
      // Acknowledged: the attempt is recorded, and retrying will not help.
      return NextResponse.json(
        { received: true, applied: false, reason: outcome.reason },
        { status: 200 },
      );
    }

    return NextResponse.json({ received: true, applied: true }, { status: 200 });
  } catch (error) {
    console.error(`[webhook:${slug}] processing failed`, error);
    // A genuine server-side failure — invite the gateway to retry.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

/** Some providers probe the endpoint with a GET before enabling it. */
export async function GET() {
  return NextResponse.json({ status: "ready" });
}
