"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getOrCreateCart } from "@/lib/cart";
import { prisma } from "@/lib/prisma";

export type AuthState = { ok: boolean; message?: string };

const credentials = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  // One message for both branches, so the form cannot be used to discover
  // which email addresses hold accounts.
  const valid =
    user?.isActive && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    return { ok: false, message: "Those credentials were not recognised." };
  }

  await createSession({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });

  // Attach any cart built while signed out to the account.
  await getOrCreateCart(user.id);

  await recordAudit({
    actor: { id: user.id, label: user.email },
    action: "auth.signed_in",
    entityType: "User",
    entityId: user.id,
  });

  const next = String(formData.get("next") ?? "");
  redirect(next && next.startsWith("/") ? next : "/");
}

const registration = z
  .object({
    fullName: z.string().min(2, "Enter your full name."),
    email: z.email("Enter a valid email address."),
    phone: z.string().optional(),
    organisation: z.string().optional(),
    password: z
      .string()
      .min(10, "Choose a password of at least 10 characters."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = registration.safeParse({
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    organisation: String(formData.get("organisation") ?? "").trim() || undefined,
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return {
      ok: false,
      message: "An account already exists for that email address.",
    };
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      organisation: parsed.data.organisation,
      passwordHash: await hashPassword(parsed.data.password),
      // Self-registration only ever creates customers; staff roles are
      // assigned by an administrator.
      role: Role.CUSTOMER,
    },
  });

  await createSession({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  });
  await getOrCreateCart(user.id);

  await recordAudit({
    actor: { id: user.id, label: user.email },
    action: "auth.registered",
    entityType: "User",
    entityId: user.id,
  });

  const next = String(formData.get("next") ?? "");
  redirect(next && next.startsWith("/") ? next : "/");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
