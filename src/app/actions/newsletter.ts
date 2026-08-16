"use server";

import { z } from "zod";
import { clientIp } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type SubscribeState = { ok: boolean; message?: string };

const schema = z.object({
  name: z.string().max(120).optional(),
  email: z.email("Enter a valid email address."),
});

/**
 * Newsletter sign-up from the site footer.
 *
 * Re-submitting a known address updates the record rather than failing, and
 * revives it if the person had previously unsubscribed, treating a fresh
 * sign-up as fresh consent.
 *
 * The response is identical whether the address was already on the list or
 * not, so the form cannot be used to test which addresses are subscribed.
 */
export async function subscribeAction(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const ip = await clientIp();
    await prisma.newsletterSubscriber.upsert({
      where: { email: parsed.data.email },
      create: {
        email: parsed.data.email,
        name: parsed.data.name,
        sourceIp: ip,
      },
      update: {
        name: parsed.data.name,
        consentedAt: new Date(),
        unsubscribedAt: null,
        sourceIp: ip,
      },
    });
  } catch (error) {
    console.error("[newsletter] sign-up failed", error);
    return {
      ok: false,
      message: "We could not record your details just now. Please try again.",
    };
  }

  return { ok: true, message: "Thank you. You have been added to our mailing list." };
}
