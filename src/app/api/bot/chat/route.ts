import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { conversationFor, respond } from "@/lib/bot/agent";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Identifies the browser's chat thread, separately from the cart. */
const CHAT_COOKIE = "phc_chat";
const CART_COOKIE = "phc_cart";

/** A single message is plenty; anything longer is a paste, not a question. */
const MAX_MESSAGE = 1_000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: "That is rather long. Could you shorten it?" },
      { status: 400 },
    );
  }

  const store = await cookies();
  let chatId = store.get(CHAT_COOKIE)?.value;
  if (!chatId) {
    chatId = randomBytes(16).toString("hex");
    store.set(CHAT_COOKIE, chatId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  const session = await getSession();
  const conversationId = await conversationFor("WEB", chatId, session?.fullName);

  // Join the conversation to whatever the browser is already holding, so a
  // customer who added a venue on the website and then opened the chat is
  // talking about the same basket rather than a second, invisible one.
  const cartSessionId = store.get(CART_COOKIE)?.value;
  if (cartSessionId) {
    const cart = await prisma.cart.findUnique({ where: { sessionId: cartSessionId } });
    if (cart) {
      await prisma.botConversation.update({
        where: { id: conversationId },
        data: { cartId: cart.id, userId: session?.id ?? undefined },
      });
    }
  } else if (session) {
    await prisma.botConversation.update({
      where: { id: conversationId },
      data: { userId: session.id },
    });
  }

  let reply;
  try {
    reply = await respond(conversationId, message);
  } catch (error) {
    console.error("[bot] chat failed", error);
    return NextResponse.json(
      {
        reply:
          "Something went wrong at my end. Please try again, or browse the venues directly.",
      },
      { status: 200 },
    );
  }

  // If the bot created the cart, hand its session id to the browser so the
  // website's own cart page shows the same holds. Without this the customer
  // would hold slots in chat and find an empty cart on the site.
  const conversation = await prisma.botConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { cartId: true },
  });
  if (conversation.cartId && !cartSessionId) {
    const cart = await prisma.cart.findUnique({
      where: { id: conversation.cartId },
      select: { sessionId: true },
    });
    if (cart) {
      store.set(CART_COOKIE, cart.sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

  return NextResponse.json({
    reply: reply.text,
    toolsUsed: reply.toolsUsed,
    declined: reply.declined ?? null,
  });
}

/** The thread so far, so reopening the widget does not lose the conversation. */
export async function GET() {
  const store = await cookies();
  const chatId = store.get(CHAT_COOKIE)?.value;
  if (!chatId) return NextResponse.json({ messages: [] });

  const conversation = await prisma.botConversation.findUnique({
    where: { channel_externalId: { channel: "WEB", externalId: chatId } },
    select: {
      messages: {
        where: { role: { in: ["USER", "MODEL"] } },
        orderBy: { createdAt: "asc" },
        take: 40,
        select: { role: true, content: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({
    messages:
      conversation?.messages.map((m) => ({
        role: m.role === "USER" ? "user" : "bot",
        text: m.content,
      })) ?? [],
  });
}
