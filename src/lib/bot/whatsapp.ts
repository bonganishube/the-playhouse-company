import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API transport.
 *
 * Meta delivers each inbound message as a webhook and expects a 200 quickly;
 * anything slow is treated as a failure and redelivered, which is why the
 * route acknowledges first and answers afterwards. Replies go back out through
 * the Graph API as a separate request.
 *
 * Everything here degrades to inert when the credentials are absent, so the
 * website chat is unaffected before a Meta Business account exists.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

/**
 * Confirm the payload really came from Meta.
 *
 * Without this the endpoint is a public hole: anyone who learns the URL could
 * post a message claiming to be any telephone number and read back whatever
 * the assistant knows about that person's bookings. Compared in constant time,
 * because a byte-by-byte comparison leaks where a forgery first differs.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Refusing is the safe default. An unsigned webhook is only acceptable
    // when nothing sensitive is behind it, and bookings are.
    console.error("[whatsapp] WHATSAPP_APP_SECRET is not set; rejecting webhook");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboundMessage = {
  /** Meta's id, used to reject a redelivery of something already answered. */
  messageId: string;
  /** Sender in E.164 without the plus, as Meta reports it. */
  from: string;
  profileName?: string;
  text: string;
};

/**
 * Pull the text messages out of a webhook payload.
 *
 * The same envelope carries delivery receipts, read receipts and reactions.
 * Only genuine inbound text is returned; everything else is ignored rather
 * than answered, or the assistant would reply to its own delivery receipts.
 */
export function extractMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const body = payload as {
    entry?: {
      changes?: {
        value?: {
          contacts?: { profile?: { name?: string }; wa_id?: string }[];
          messages?: {
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
          }[];
        };
      }[];
    }[];
  };

  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const names = new Map(
        (value?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]),
      );
      for (const message of value?.messages ?? []) {
        if (message.type !== "text") continue;
        const text = message.text?.body?.trim();
        if (!text || !message.id || !message.from) continue;
        out.push({
          messageId: message.id,
          from: message.from,
          profileName: names.get(message.from) ?? undefined,
          text,
        });
      }
    }
  }

  return out;
}

/**
 * Send a reply.
 *
 * WhatsApp caps a text body at 4096 characters. The assistant is instructed to
 * be brief, but a long tool result could still push it over, so it is split
 * rather than truncated: losing the end of a payment link would be worse than
 * two messages.
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!whatsappConfigured()) {
    console.warn("[whatsapp] not configured; reply not sent");
    return;
  }

  for (const chunk of splitForWhatsApp(text)) {
    const response = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          // Link previews are noise on a payment link and slow the send.
          text: { preview_url: false, body: chunk },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`WhatsApp send failed ${response.status}: ${detail.slice(0, 300)}`);
    }
  }
}

const WHATSAPP_LIMIT = 4_096;

/** Split on paragraph boundaries where possible, so a message reads whole. */
export function splitForWhatsApp(text: string): string[] {
  if (text.length <= WHATSAPP_LIMIT) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > WHATSAPP_LIMIT) {
    const window = rest.slice(0, WHATSAPP_LIMIT);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    const at = cut > WHATSAPP_LIMIT * 0.5 ? cut : WHATSAPP_LIMIT;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
