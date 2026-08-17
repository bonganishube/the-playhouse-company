import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPassword } from "./auth";
import { env } from "./env";
import { prisma } from "./prisma";

/**
 * Password reset.
 *
 * Two audiences, not one. Customers who set a password and forgot it, and
 * customers who never had one: guest checkout creates an account with a random
 * unusable password so the booking has an owner, and without this flow those
 * people could never sign in to view the booking or settle an outstanding
 * balance. The wording in the emails covers both cases.
 */

/** How long a link stays usable. Long enough to find the email, short enough
 * that one left in an inbox is not a standing key to the account. */
export const RESET_TTL_MINUTES = 60;

/** Ceiling on live tokens per account, so requesting cannot be used to flood
 * someone's inbox indefinitely. */
const MAX_LIVE_TOKENS = 5;

/**
 * Tokens are stored hashed.
 *
 * The emailed value is the only copy. Anyone reading the database, a backup or
 * a log therefore holds nothing they can redeem, which matters because a reset
 * token is briefly equivalent to the password itself.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ResetRequestOutcome = {
  /** Always true to the caller. See the note in requestPasswordReset. */
  ok: true;
  /** Present only when a token was really issued, for the despatch step. */
  issued?: { userId: string; token: string; email: string; fullName: string };
};

/**
 * Begin a reset.
 *
 * Deliberately indistinguishable from the outside whether the address exists.
 * A form that says "no such account" is a membership oracle: it lets anyone
 * test an email list against your customer base. The caller always reports the
 * same message, and only the returned `issued` field, never surfaced to the
 * browser, says whether anything was sent.
 */
export async function requestPasswordReset(
  email: string,
  requestIp?: string,
): Promise<ResetRequestOutcome> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, fullName: true, isActive: true },
  });

  // A deactivated account is treated exactly like a missing one. Restoring
  // access to a suspended account is a decision for staff, not a form.
  if (!user || !user.isActive) return { ok: true };

  const live = await prisma.passwordResetToken.count({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (live >= MAX_LIVE_TOKENS) return { ok: true };

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      requestIp,
    },
  });

  return {
    ok: true,
    issued: { userId: user.id, token, email: user.email, fullName: user.fullName },
  };
}

export type TokenCheck =
  | { ok: true; userId: string; email: string; fullName: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Is this link still good?
 *
 * Used before showing the form, so someone arriving with a stale link is told
 * so rather than filling in a password that is then rejected.
 */
export async function checkResetToken(token: string): Promise<TokenCheck> {
  if (!token || token.length < 32) return { ok: false, reason: "invalid" };

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { select: { id: true, email: true, fullName: true, isActive: true } },
    },
  });

  if (!record || !record.user.isActive) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    userId: record.user.id,
    email: record.user.email,
    fullName: record.user.fullName,
  };
}

export type ConsumeResult =
  | { ok: true; userId: string; email: string; fullName: string; role: string }
  | { ok: false; message: string };

/**
 * Redeem a token and set the new password.
 *
 * The token is marked used and every other outstanding token for the account
 * is retired in the same transaction. Otherwise a second link, perhaps from an
 * earlier request sitting in the same inbox, would still open the account
 * after the password had been changed.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<ConsumeResult> {
  const problem = validatePassword(newPassword);
  if (problem) return { ok: false, message: problem };

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || !record.user.isActive) {
    return { ok: false, message: "This reset link is not valid." };
  }
  if (record.usedAt) {
    return {
      ok: false,
      message: "This link has already been used. Request a new one to continue.",
    };
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      message: `This link has expired. Reset links last ${RESET_TTL_MINUTES} minutes; request a new one.`,
    };
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    // Guard against two submissions of the same link racing: the update only
    // matches while usedAt is still null, so the second finds nothing.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error("RESET_ALREADY_USED");

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: record.userId,
        actorLabel: record.user.email,
        action: "user.password_reset",
        entityType: "User",
        entityId: record.userId,
        ipAddress: record.requestIp,
      },
    });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "RESET_ALREADY_USED") return null;
    throw error;
  });

  const fresh = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { usedAt: true },
  });
  if (!fresh?.usedAt) {
    return { ok: false, message: "This link has already been used." };
  }

  return {
    ok: true,
    userId: record.user.id,
    email: record.user.email,
    fullName: record.user.fullName,
    role: record.user.role,
  };
}

/**
 * Password rules.
 *
 * Length is the requirement that actually resists guessing; composition rules
 * mostly push people towards predictable substitutions. A minimum of ten and a
 * check against the obvious choices is the useful pair.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return "Choose a password of at least 10 characters.";
  }
  if (password.length > 200) {
    return "That password is too long.";
  }
  const common = [
    "password",
    "12345678",
    "qwerty",
    "playhouse",
    "letmein",
    "welcome",
  ];
  const lower = password.toLowerCase();
  if (common.some((c) => lower.includes(c))) {
    return "That password is too easy to guess. Choose something less predictable.";
  }
  return null;
}

/** The link that goes in the email. */
export function resetUrl(token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/reset-password/${token}`;
}

/**
 * Retire expired tokens.
 *
 * Called from the maintenance sweep. Nothing depends on it for correctness,
 * since expiry is checked on redemption, but a reset table that only ever
 * grows is a liability worth trimming.
 */
export async function purgeExpiredResetTokens(): Promise<number> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
        { usedAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
      ],
    },
  });
  return count;
}

/** Constant-time comparison, exported for tests of the hashing helper. */
export function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(hashToken(a));
  const y = Buffer.from(hashToken(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
