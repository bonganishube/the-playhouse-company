import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createSession, verifyPassword } from "@/lib/auth";
import { getOrCreateCart } from "@/lib/cart";
import { prisma } from "@/lib/prisma";

/**
 * Signing in from inside the chat widget.
 *
 * A returning customer is stopped at the booking, because an account already
 * exists for their address and the assistant will not take someone's word for
 * who they are. This endpoint lets the widget put a real sign-in form in front
 * of them so the conversation can carry on.
 *
 * It exists as a separate route rather than reusing signInAction because that
 * action answers with a redirect, which is right for a page submit and wrong
 * for a widget that has to stay where it is and continue a conversation.
 *
 * The credentials are posted straight here and never become chat messages.
 * Every message is stored and replayed to the model on the following turn, so
 * a password spoken in the conversation would be written to the database in
 * plain text and sent to the model provider with the rest of the transcript.
 */

const credentials = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * Attempts allowed before the door closes for a while.
 *
 * In memory, so on a platform that runs several instances this bounds each one
 * rather than the total. That is worth having, since it stops the cheap case of
 * one client hammering one instance, but it is not a substitute for a durable
 * limiter and should not be mistaken for one.
 */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { count: number; first: number }>();

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const seen = attempts.get(key);
  if (!seen || now - seen.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  seen.count += 1;
  return seen.count > MAX_ATTEMPTS;
}

function forget(key: string): void {
  attempts.delete(key);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = credentials.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter your email address and password." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const key = `${request.headers.get("x-forwarded-for") ?? "local"}:${email}`;

  if (tooManyAttempts(key)) {
    return NextResponse.json(
      {
        error:
          "Too many attempts. Wait a few minutes, or sign in on the website and " +
          "come back to this chat.",
      },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // One answer for every failure. Distinguishing "no such account" from "wrong
  // password" here would turn the widget into a way of discovering which
  // addresses hold accounts.
  const valid =
    user?.isActive && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    return NextResponse.json(
      { error: "Those credentials were not recognised." },
      { status: 401 },
    );
  }

  await createSession({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });

  // The slots held during the conversation belong to them now.
  await getOrCreateCart(user.id);

  await recordAudit({
    actor: { id: user.id, label: user.email },
    action: "auth.signed_in",
    entityType: "User",
    entityId: user.id,
    metadata: { via: "chat" },
  });

  forget(key);

  return NextResponse.json({ ok: true, fullName: user.fullName });
}
