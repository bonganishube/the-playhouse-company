import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma/enums";
import { env } from "./env";
import { prisma } from "./prisma";

const COOKIE_NAME = "phc_session";
const SESSION_HOURS = 12;

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

/**
 * Role capability model.
 *
 * Rather than ranking roles on a single ladder, each role is granted an
 * explicit set of capabilities. FINANCE and VENUE_MANAGER are peers with
 * different remits, which a simple hierarchy could not express.
 */
export const CAPABILITIES = {
  "venues.view": [Role.STAFF, Role.VENUE_MANAGER, Role.FINANCE, Role.ADMIN],
  "venues.manage": [Role.ADMIN],
  "bookings.view": [Role.STAFF, Role.VENUE_MANAGER, Role.FINANCE, Role.ADMIN],
  "bookings.approve": [Role.VENUE_MANAGER, Role.ADMIN],
  "bookings.cancel": [Role.VENUE_MANAGER, Role.FINANCE, Role.ADMIN],
  "payments.view": [Role.FINANCE, Role.ADMIN],
  "payments.record": [Role.FINANCE, Role.ADMIN],
  "reports.view": [Role.STAFF, Role.VENUE_MANAGER, Role.FINANCE, Role.ADMIN],
  "schedule.export": [Role.STAFF, Role.VENUE_MANAGER, Role.FINANCE, Role.ADMIN],
  "users.manage": [Role.ADMIN],
  "settings.manage": [Role.ADMIN],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role | undefined, capability: Capability): boolean {
  if (!role) return false;
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

/** Any role that may reach the administrative console at all. */
export function isStaffRole(role: Role): boolean {
  return role !== Role.CUSTOMER;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** The signed-in user, or null. Verifies the token signature and expiry. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      fullName: String(payload.fullName ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/**
 * Session re-checked against the database. Use where a stale role or a
 * deactivated account would be consequential, i.e. all administrative
 * actions. Since the JWT itself cannot be revoked before it expires.
 */
export async function getVerifiedSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

export class AuthorisationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthorisationError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getVerifiedSession();
  if (!session) throw new AuthorisationError("Sign in to continue.", 401);
  return session;
}

export async function requireCapability(
  capability: Capability,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, capability)) {
    throw new AuthorisationError(
      "You do not have permission to perform this action.",
      403,
    );
  }
  return user;
}

/**
 * Venue managers are scoped to their assigned venues; admins are not.
 * Returns null when the user may act on every venue.
 */
export async function venueScopeFor(
  user: SessionUser,
): Promise<string[] | null> {
  if (user.role !== Role.VENUE_MANAGER) return null;
  const rows = await prisma.venueManager.findMany({
    where: { userId: user.id },
    select: { venueId: true },
  });
  return rows.map((r) => r.venueId);
}
