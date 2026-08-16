import { headers } from "next/headers";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

type Actor = SessionUser | { id?: string; label: string } | null;

/**
 * Append to the audit trail.
 *
 * Auditing must never break the operation it records, so failures are logged
 * and swallowed rather than propagated.
 */
export async function recordAudit(input: {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const actorId =
      input.actor && "id" in input.actor ? (input.actor.id ?? null) : null;
    const actorLabel = !input.actor
      ? "system"
      : "email" in input.actor
        ? `${input.actor.fullName} <${input.actor.email}>`
        : input.actor.label;

    await prisma.auditLog.create({
      data: {
        actorId,
        actorLabel,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as never,
        ipAddress: input.ipAddress ?? (await clientIp()),
      },
    });
  } catch (error) {
    console.error("[audit] failed to record entry", input.action, error);
  }
}

/** Best-effort client IP, honouring the proxy headers used in production. */
export async function clientIp(): Promise<string | undefined> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return h.get("x-real-ip") ?? undefined;
  } catch {
    return undefined;
  }
}
