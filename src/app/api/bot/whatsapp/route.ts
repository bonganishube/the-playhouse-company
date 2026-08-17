import { NextResponse, after } from "next/server";
import { BotRole } from "@/generated/prisma/enums";
import { conversationFor, respond } from "@/lib/bot/agent";
import { prisma } from "@/lib/prisma";
import {
  extractMessages,
  sendWhatsAppMessage,
  verifySignature,
  whatsappConfigured,
} from "@/lib/bot/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Meta's one-time subscription handshake.
 *
 * Called when the webhook URL is saved in the Meta dashboard. It echoes the
 * challenge back only if the token matches the one configured here, which is
 * how Meta proves the endpoint is ours to claim.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    console.error("[whatsapp] WHATSAPP_VERIFY_TOKEN is not set; cannot verify");
    return new NextResponse("not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("forbidden", { status: 403 });
}

/**
 * Inbound messages.
 *
 * Answered out of band. Meta expects an acknowledgement within seconds and
 * redelivers anything slower, while a reply from the assistant takes long
 * enough, several seconds with tool calls, to trip that. So the payload is
 * authenticated, recorded and acknowledged immediately, and `after()` does the
 * thinking once the response has gone.
 */
export async function POST(request: Request) {
  // The raw body is needed byte-for-byte: the signature is over exactly what
  // was sent, and re-serialising parsed JSON would not reproduce it.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn("[whatsapp] rejected a webhook with a bad or missing signature");
    return new NextResponse("forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const messages = extractMessages(payload);

  // Always 200, even with nothing to do. Delivery receipts and reactions come
  // through this same endpoint, and a non-200 would make Meta retry them.
  if (messages.length === 0) return NextResponse.json({ ok: true });

  if (!whatsappConfigured()) {
    console.error("[whatsapp] received a message but cannot reply; token or phone id missing");
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    for (const message of messages) {
      try {
        const conversationId = await conversationFor(
          "WHATSAPP",
          message.from,
          message.profileName,
        );

        // Claim the message before answering it. The unique index means a
        // redelivery loses the race and is dropped, rather than producing a
        // second reply and a second set of tool calls.
        try {
          await prisma.botMessage.create({
            data: {
              conversationId,
              role: BotRole.TOOL,
              content: "inbound",
              toolName: "whatsapp.received",
              externalId: message.messageId,
            },
          });
        } catch {
          console.info(`[whatsapp] ignoring redelivery of ${message.messageId}`);
          continue;
        }

        const reply = await respond(conversationId, message.text);

        // A thread a human has taken over stays silent, so staff and the
        // assistant are never answering the same customer at once.
        if (reply.declined === "handed_over") continue;
        if (reply.text) await sendWhatsAppMessage(message.from, reply.text);
      } catch (error) {
        console.error("[whatsapp] failed to answer", error);
        try {
          await sendWhatsAppMessage(
            message.from,
            "Sorry, something went wrong at our end. Please try again shortly, " +
              "or book at " + (process.env.APP_URL ?? "our website") + "/venues.",
          );
        } catch {
          /* the customer is unreachable; the error above is the record */
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
