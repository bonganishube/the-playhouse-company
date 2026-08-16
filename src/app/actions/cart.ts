"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addToCart, getOrCreateCart, removeFromCart } from "@/lib/cart";
import { getSession } from "@/lib/auth";

const addSchema = z.object({
  venueId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export type ActionState = { ok: boolean; message?: string };

export async function addToCartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = addSchema.safeParse({
    venueId: formData.get("venueId"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Please select a valid date and time." };
  }

  const session = await getSession();
  const cart = await getOrCreateCart(session?.id);

  const result = await addToCart(
    cart.id,
    parsed.data.venueId,
    new Date(parsed.data.startsAt),
    new Date(parsed.data.endsAt),
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/cart");
  revalidatePath("/venues");

  // The embedded portal keeps the customer inside the iframe by returning them
  // to /embed/cart rather than the full site. Only same-origin paths are
  // honoured, so this cannot be turned into an open redirect.
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/cart");
}

const addDaysSchema = z.object({
  venueId: z.string().min(1),
  /** Each entry is "<startISO>|<endISO>" for one day's hire window. */
  days: z.array(z.string()).min(1),
});

/**
 * Hold one or more whole days at a daily-rate venue.
 *
 * Each date becomes its own reservation charged at one day, which keeps the
 * cart legible and lets a single date be released without unpicking the rest.
 * Partial success is deliberate: if one date is taken while the customer is
 * choosing, the others are still secured and the conflict is reported.
 */
export async function addDaysToCartAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = addDaysSchema.safeParse({
    venueId: formData.get("venueId"),
    days: formData.getAll("days").map(String),
  });

  if (!parsed.success) {
    return { ok: false, message: "Please select at least one date." };
  }

  const session = await getSession();
  const cart = await getOrCreateCart(session?.id);

  const failures: string[] = [];
  let held = 0;

  for (const day of parsed.data.days) {
    const [startsAt, endsAt] = day.split("|");
    if (!startsAt || !endsAt) continue;

    const result = await addToCart(
      cart.id,
      parsed.data.venueId,
      new Date(startsAt),
      new Date(endsAt),
    );
    if (result.ok) held += 1;
    else failures.push(`${startsAt.slice(0, 10)}: ${result.message}`);
  }

  if (held === 0) {
    return {
      ok: false,
      message: failures[0] ?? "Those dates are no longer available.",
    };
  }

  revalidatePath("/cart");
  revalidatePath("/venues");

  if (failures.length > 0) {
    // Some dates were secured; the customer must see which were not.
    return {
      ok: false,
      message: `${held} date${held === 1 ? "" : "s"} added. Could not add — ${failures.join("; ")}`,
    };
  }

  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/cart");
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) return;

  const session = await getSession();
  const cart = await getOrCreateCart(session?.id);
  await removeFromCart(cart.id, reservationId);

  revalidatePath("/cart");
}
