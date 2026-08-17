import { BotRole } from "@/generated/prisma/enums";
import { env } from "../env";
import { prisma } from "../prisma";
import { TOOL_DECLARATIONS, runTool, type ToolContext } from "./tools";

/**
 * The conversational booking agent.
 *
 * Gemini decides what to say; it never decides what is true. Every fact about
 * a venue, a price or an availability comes back from a tool that reads the
 * same database the website does, and the system prompt below spends most of
 * its length making that division clear. A booking assistant that improvises a
 * rate is worse than no booking assistant at all.
 *
 * Free-tier spend is treated as a hard constraint rather than a hope. See
 * `withinBudget` and the caps in CONFIG.
 */

const CONFIG = {
  /**
   * The cheapest model that still calls tools reliably. Flash-lite costs a
   * fraction of flash, and the task, choosing among nine tools and writing two
   * sentences, does not need a larger one.
   *
   * Overridable because Google retires these on its own schedule: 2.5-flash-lite
   * was closed to new keys while this was being written, and the API named its
   * successor in the error. Set GEMINI_MODEL to move without a deploy.
   */
  model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",

  /** Replies are short by design; this is a ceiling, not a target. */
  maxOutputTokens: 400,

  /**
   * How many past turns are re-sent. The whole transcript is stored, but
   * sending all of it would make every message cost more than the last until
   * a long conversation became the most expensive thing on the platform.
   */
  historyTurns: 12,

  /** Tool round-trips per message, so a confused model cannot loop forever. */
  maxToolRounds: 4,

  /** Whole-platform ceiling for a day, counted in tokens across all channels. */
  dailyTokenBudget: Number(process.env.BOT_DAILY_TOKEN_BUDGET ?? 200_000),

  /** Messages one conversation may send in an hour. */
  perConversationHourly: 40,
};

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type AgentReply = {
  text: string;
  /** Tools actually run, for the transcript and for tests. */
  toolsUsed: string[];
  tokensIn: number;
  tokensOut: number;
  /** Set when the reply was produced without calling the model. */
  declined?: "budget" | "rate_limit" | "not_configured" | "handed_over";
};

export function botConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * The instructions that make this a Playhouse booking clerk rather than a
 * general assistant.
 *
 * Written as prohibitions where the cost of getting it wrong is real money or
 * a double booking, because those are the cases a model will otherwise
 * smooth over to be helpful.
 */
function systemPrompt(now: Date, channel: string): string {
  return [
    "You are the booking assistant for The Playhouse Company, a performing arts venue in Durban, South Africa.",
    "You help customers find a venue, check dates, hold them, and complete a booking.",
    "",
    "HOW YOU SPEAK",
    "- Plain South African English. Warm but brief: two or three sentences unless asked for detail.",
    "- Amounts in rands as the tools give them, for example R27 000,00. Never reformat or round them.",
    `- Today is ${now.toISOString().slice(0, 10)}. Resolve 'next Friday' and similar yourself, then confirm the actual date back to the customer.`,
    channel === "WHATSAPP"
      ? "- This is WhatsApp. No markdown, no tables, no headings. Short paragraphs and plain hyphens for lists."
      : "- This is the website chat. Keep formatting minimal; short paragraphs, no headings.",
    "",
    "WHAT YOU MUST NOT DO",
    "- Never state a price, a capacity or an availability that did not come from a tool in this conversation. If you have not looked it up, look it up.",
    "- Never say a booking is confirmed. You create a booking and give a payment link; it is secure only once paid, and approval venues need management approval after that.",
    "- Never take card details, and never accept payment in the chat. Payment happens only through the link.",
    "- Never call create_booking until the customer has explicitly agreed to the conditions of hire. Show them the link and ask.",
    "- Never reveal another customer's booking. Looking one up needs the reference and the matching email together.",
    "- If a tool fails, say what went wrong in your own words and offer the next step. Do not retry the same call repeatedly.",
    "",
    "HOW BOOKING WORKS HERE",
    "- Theatres and function venues are hired by the day and need management approval. Rehearsal rooms and the recording studio are hired by the hour and confirm automatically on payment.",
    "- Published rates include VAT.",
    "- Holding a slot is temporary and lapses. Tell the customer the hold is not a booking.",
    "- Some venues allow a deposit with the balance before the event; view_cart says when one is offered.",
    "",
    "If the customer wants something you cannot do, say so plainly and point them to the website or bookings@playhousecompany.com.",
  ].join("\n");
}

/**
 * Have all channels together stayed inside today's allowance?
 *
 * Counted from what was actually spent rather than estimated in advance, so a
 * conversation that turns out expensive still stops the next one. The key was
 * issued on a free tier for testing, and running it dry would take the feature
 * down for everybody.
 */
async function withinBudget(): Promise<boolean> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const spent = await prisma.botMessage.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { tokensIn: true, tokensOut: true },
  });
  const used = (spent._sum.tokensIn ?? 0) + (spent._sum.tokensOut ?? 0);
  return used < CONFIG.dailyTokenBudget;
}

async function withinRate(conversationId: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000);
  const count = await prisma.botMessage.count({
    where: { conversationId, role: BotRole.USER, createdAt: { gte: since } },
  });
  return count < CONFIG.perConversationHourly;
}

type Part =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type Content = { role: "user" | "model"; parts: Part[] };

/** Rebuild the model's view of the conversation from the stored transcript. */
async function loadHistory(conversationId: string): Promise<Content[]> {
  const rows = await prisma.botMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: CONFIG.historyTurns,
  });

  return rows
    .reverse()
    .map((m): Content | null => {
      if (m.role === BotRole.USER) {
        return { role: "user", parts: [{ text: m.content }] };
      }
      if (m.role === BotRole.MODEL) {
        return m.content ? { role: "model", parts: [{ text: m.content }] } : null;
      }
      return null; // tool rows are replayed only within a single turn
    })
    .filter((c): c is Content => c !== null);
}

async function callGemini(
  contents: Content[],
  system: string,
): Promise<{ parts: Part[]; tokensIn: number; tokensOut: number }> {
  const response = await fetch(
    `${ENDPOINT}/${CONFIG.model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: {
          maxOutputTokens: CONFIG.maxOutputTokens,
          temperature: 0.3,
          // Gemini 3.x reasons before answering unless told not to, and those
          // thinking tokens are billed. Choosing among nine well-described
          // tools does not need it, and switching it off cuts both the cost
          // and the latency that made the first attempt time out.
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
      // Generous: a cold model behind a tool call is slow, and a timeout here
      // costs the customer their whole turn.
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: Part[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  return {
    parts: json.candidates?.[0]?.content?.parts ?? [],
    tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * Answer one customer message.
 *
 * Runs the model, executes any tools it asks for, feeds the results back, and
 * repeats until it produces prose or the round limit is reached. Everything is
 * written to the transcript as it happens, so a crash midway still leaves a
 * record of what was done on the customer's behalf.
 */
export async function respond(
  conversationId: string,
  userText: string,
): Promise<AgentReply> {
  const conversation = await prisma.botConversation.findUniqueOrThrow({
    where: { id: conversationId },
  });

  if (conversation.handedOverAt) {
    return {
      text: "",
      toolsUsed: [],
      tokensIn: 0,
      tokensOut: 0,
      declined: "handed_over",
    };
  }

  if (!botConfigured()) {
    return {
      text:
        "The booking assistant is not switched on at the moment. You can book at " +
        `${env.APP_URL}/venues, or email bookings@playhousecompany.com.`,
      toolsUsed: [],
      tokensIn: 0,
      tokensOut: 0,
      declined: "not_configured",
    };
  }

  await prisma.botMessage.create({
    data: { conversationId, role: BotRole.USER, content: userText },
  });

  if (!(await withinRate(conversationId))) {
    return {
      text: "That is a lot of messages in a short time. Please give me a moment, or continue at " +
        `${env.APP_URL}/venues.`,
      toolsUsed: [],
      tokensIn: 0,
      tokensOut: 0,
      declined: "rate_limit",
    };
  }

  if (!(await withinBudget())) {
    console.warn("[bot] daily token budget exhausted; declining to call the model");
    return {
      text:
        "The assistant has reached its usage limit for today. You can still book at " +
        `${env.APP_URL}/venues, or email bookings@playhousecompany.com.`,
      toolsUsed: [],
      tokensIn: 0,
      tokensOut: 0,
      declined: "budget",
    };
  }

  const ctx: ToolContext = {
    conversationId,
    cartId: conversation.cartId,
    userId: conversation.userId,
    channelHint: { name: conversation.contactName ?? undefined },
  };

  const contents = await loadHistory(conversationId);
  const system = systemPrompt(new Date(), conversation.channel);

  const toolsUsed: string[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let text = "";

  for (let round = 0; round < CONFIG.maxToolRounds; round++) {
    const result = await callGemini(contents, system);
    tokensIn += result.tokensIn;
    tokensOut += result.tokensOut;

    const calls = result.parts.filter(
      (p): p is Extract<Part, { functionCall: unknown }> => "functionCall" in p,
    );
    const said = result.parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("")
      .trim();

    if (calls.length === 0) {
      text = said;
      break;
    }

    contents.push({ role: "model", parts: calls });

    const responses: Part[] = [];
    for (const call of calls) {
      const { name, args } = call.functionCall;
      toolsUsed.push(name);

      let outcome;
      try {
        outcome = await runTool(name, args ?? {}, ctx);
      } catch (error) {
        // A thrown tool must not take the conversation down with it; the model
        // is told plainly and can offer the customer another route.
        console.error(`[bot] tool ${name} threw`, error);
        outcome = {
          ok: false,
          message: "That could not be completed just now. Suggest the website instead.",
        };
      }

      if (outcome.cartId) ctx.cartId = outcome.cartId;

      await prisma.botMessage.create({
        data: {
          conversationId,
          role: BotRole.TOOL,
          content: outcome.ok ? "ok" : (outcome.message ?? "failed"),
          toolName: name,
          toolPayload: { args, result: outcome } as never,
        },
      });

      responses.push({
        functionResponse: { name, response: outcome as unknown as Record<string, unknown> },
      });
    }

    contents.push({ role: "user", parts: responses });
  }

  if (!text) {
    text =
      "I could not work that out. Please try rephrasing, or book directly at " +
      `${env.APP_URL}/venues.`;
  }

  await prisma.botMessage.create({
    data: {
      conversationId,
      role: BotRole.MODEL,
      content: text,
      tokensIn,
      tokensOut,
    },
  });

  await prisma.botConversation.update({
    where: { id: conversationId },
    data: { lastActiveAt: new Date() },
  });

  return { text, toolsUsed, tokensIn, tokensOut };
}

/** Find or start the thread for this channel and identifier. */
export async function conversationFor(
  channel: "WEB" | "WHATSAPP",
  externalId: string,
  contactName?: string,
): Promise<string> {
  const existing = await prisma.botConversation.findUnique({
    where: { channel_externalId: { channel, externalId } },
  });
  if (existing) return existing.id;

  const created = await prisma.botConversation.create({
    data: { channel, externalId, contactName },
  });
  return created.id;
}

/** Tokens spent today, for the admin console and the preflight report. */
export async function todaysUsage(): Promise<{ tokens: number; budget: number }> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const spent = await prisma.botMessage.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { tokensIn: true, tokensOut: true },
  });
  return {
    tokens: (spent._sum.tokensIn ?? 0) + (spent._sum.tokensOut ?? 0),
    budget: CONFIG.dailyTokenBudget,
  };
}
