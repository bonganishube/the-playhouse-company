"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BookingWorkflow,
  PaymentPolicy,
  RateBasis,
  RateKind,
  Role,
  VenueCategory,
} from "@/generated/prisma/enums";
import { recordAudit } from "@/lib/audit";
import {
  approveBooking,
  cancelBooking,
  declineCancellationRequest,
  recordManualPayment,
  rejectBooking,
  requestBalanceSettlement,
} from "@/lib/booking";
import { requireCapability, venueScopeFor, hashPassword } from "@/lib/auth";
import { resendEmail } from "@/lib/email/mailer";
import { toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { clockToMinutes } from "@/lib/time";

export type AdminState = { ok: boolean; message?: string };

/** Venue managers may only act on venues assigned to them. */
async function assertVenueScope(
  user: Awaited<ReturnType<typeof requireCapability>>,
  bookingId: string,
): Promise<void> {
  const scope = await venueScopeFor(user);
  if (scope === null) return;

  const reservations = await prisma.reservation.findMany({
    where: { bookingId },
    select: { venueId: true },
  });
  const outside = reservations.some((r) => !scope.includes(r.venueId));
  if (outside) {
    throw new Error("This booking includes a venue outside your remit.");
  }
}

// ---------------------------------------------------------------------------
// Booking workflow
// ---------------------------------------------------------------------------

export async function approveBookingAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("bookings.approve");
    const bookingId = String(formData.get("bookingId") ?? "");
    await assertVenueScope(user, bookingId);
    await approveBooking(bookingId, user);
    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: "Booking approved and confirmed." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function rejectBookingAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("bookings.approve");
    const bookingId = String(formData.get("bookingId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) {
      return { ok: false, message: "Please record a reason for the decision." };
    }
    await assertVenueScope(user, bookingId);
    await rejectBooking(bookingId, user, reason);
    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: "Booking rejected and the customer notified." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function cancelBookingAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("bookings.cancel");
    const bookingId = String(formData.get("bookingId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) {
      return { ok: false, message: "Please record a reason for the cancellation." };
    }
    await assertVenueScope(user, bookingId);
    await cancelBooking(bookingId, user, reason);
    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: "Booking cancelled and slots released." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Decline a customer's cancellation request, leaving the booking standing.
 *
 * Approving one is not a separate action: staff use the ordinary cancellation
 * below, which releases the venue and records the reason, so a cancellation is
 * handled identically however it was prompted.
 */
export async function declineCancellationAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("bookings.cancel");
    const bookingId = String(formData.get("bookingId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) {
      return { ok: false, message: "Please record a reason for the decision." };
    }
    await assertVenueScope(user, bookingId);
    await declineCancellationRequest(bookingId, user, reason);
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: "Request declined and the customer notified." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function recordPaymentAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("payments.record");
    const bookingId = String(formData.get("bookingId") ?? "");
    const amount = Number(formData.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Enter a valid amount." };
    }

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    const outstanding = toCents(booking.total) - toCents(booking.amountPaid);
    const amountCents = Math.round(amount * 100);
    if (amountCents > outstanding) {
      return {
        ok: false,
        message: `That exceeds the outstanding balance of R${(outstanding / 100).toFixed(2)}.`,
      };
    }

    await recordManualPayment(
      bookingId,
      amountCents,
      user,
      String(formData.get("note") ?? "") || undefined,
    );
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: "Payment recorded and a receipt issued." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function requestBalanceAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await requireCapability("payments.record");
    const bookingId = String(formData.get("bookingId") ?? "");
    await requestBalanceSettlement(bookingId);
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: "Full balance is now due on this booking." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

/**
 * Send a confirmation, receipt or notice again.
 *
 * Re-sends the stored message rather than regenerating it, so the customer
 * receives exactly what was originally produced even if a tariff or template
 * has since changed.
 */
export async function resendEmailAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const actor = await requireCapability("bookings.view");
    const logId = String(formData.get("logId") ?? "");
    const result = await resendEmail(logId);

    await recordAudit({
      actor,
      action: "email.resent",
      entityType: "EmailLog",
      entityId: logId,
      metadata: { status: result.status },
    });

    const bookingId = String(formData.get("bookingId") ?? "");
    if (bookingId) revalidatePath(`/admin/bookings/${bookingId}`);

    if (result.status === "SENT") {
      return { ok: true, message: "Message sent." };
    }
    if (result.status === "NOT_CONFIGURED") {
      return {
        ok: false,
        message:
          "No mail server is configured, so the message was recorded but not delivered.",
      };
    }
    return { ok: false, message: result.error ?? "Delivery failed." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Venue configuration
// ---------------------------------------------------------------------------

const venueSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().min(2),
  shortInfo: z.string().optional(),
  description: z.string().min(10),
  capacity: z.coerce.number().int().positive().optional(),
  location: z.string().optional(),
  isActive: z.boolean(),
  workflow: z.enum(BookingWorkflow),
  paymentPolicy: z.enum(PaymentPolicy),
  depositPercent: z.coerce.number().int().min(1).max(100),
  bufferBeforeMinutes: z.coerce.number().int().min(0).max(1440),
  bufferAfterMinutes: z.coerce.number().int().min(0).max(1440),
  minBookingMinutes: z.coerce.number().int().min(15),
  slotIncrementMinutes: z.coerce.number().int().min(5).max(240),
  minNoticeHours: z.coerce.number().int().min(0),
  maxAdvanceDays: z.coerce.number().int().min(1),
  category: z.enum(VenueCategory),
  rateBasis: z.enum(RateBasis),
  /** VAT-inclusive, per day or per hour according to rateBasis. */
  rate: z.coerce.number().nonnegative(),
  outlookMailbox: z.string().optional(),
});

export async function saveVenueAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("venues.manage");

    const parsed = venueSchema.safeParse({
      venueId: formData.get("venueId"),
      name: formData.get("name"),
      shortInfo: String(formData.get("shortInfo") ?? "") || undefined,
      description: formData.get("description"),
      capacity: formData.get("capacity") || undefined,
      location: String(formData.get("location") ?? "") || undefined,
      isActive: formData.get("isActive") === "on",
      workflow: formData.get("workflow"),
      paymentPolicy: formData.get("paymentPolicy"),
      depositPercent: formData.get("depositPercent"),
      bufferBeforeMinutes: formData.get("bufferBeforeMinutes"),
      bufferAfterMinutes: formData.get("bufferAfterMinutes"),
      minBookingMinutes: formData.get("minBookingMinutes"),
      slotIncrementMinutes: formData.get("slotIncrementMinutes"),
      minNoticeHours: formData.get("minNoticeHours"),
      maxAdvanceDays: formData.get("maxAdvanceDays"),
      category: formData.get("category"),
      rateBasis: formData.get("rateBasis"),
      rate: formData.get("rate"),
      outlookMailbox: String(formData.get("outlookMailbox") ?? "") || undefined,
    });

    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message };
    }
    const d = parsed.data;

    if (d.minBookingMinutes % d.slotIncrementMinutes !== 0) {
      return {
        ok: false,
        message:
          "The minimum booking length must be a multiple of the booking increment.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.venue.update({
        where: { id: d.venueId },
        data: {
          name: d.name,
          shortInfo: d.shortInfo,
          description: d.description,
          capacity: d.capacity,
          location: d.location,
          isActive: d.isActive,
          category: d.category,
          rateBasis: d.rateBasis,
          workflow: d.workflow,
          paymentPolicy: d.paymentPolicy,
          depositPercent: d.depositPercent,
          bufferBeforeMinutes: d.bufferBeforeMinutes,
          bufferAfterMinutes: d.bufferAfterMinutes,
          minBookingMinutes: d.minBookingMinutes,
          slotIncrementMinutes: d.slotIncrementMinutes,
          minNoticeHours: d.minNoticeHours,
          maxAdvanceDays: d.maxAdvanceDays,
          outlookMailbox: d.outlookMailbox ?? null,
        },
      });

      // Exactly one rate, matching how the venue is sold. Rates are replaced
      // rather than edited in place; existing reservations keep their own
      // pricing snapshot, so history is unaffected.
      const isDaily = d.rateBasis === RateBasis.DAILY;
      await tx.venueRate.deleteMany({ where: { venueId: d.venueId } });
      await tx.venueRate.create({
        data: {
          venueId: d.venueId,
          kind: isDaily ? RateKind.DAILY : RateKind.HOURLY,
          label: isDaily
            ? "Full-day hire (incl. VAT)"
            : "Hourly hire (incl. VAT)",
          amount: d.rate.toFixed(2),
        },
      });
    });

    await recordAudit({
      actor: user,
      action: "venue.updated",
      entityType: "Venue",
      entityId: d.venueId,
      metadata: { name: d.name },
    });

    revalidatePath("/admin/venues");
    revalidatePath(`/admin/venues/${d.venueId}`);
    revalidatePath("/venues");
    return { ok: true, message: "Venue configuration saved." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function saveOperatingHoursAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("venues.manage");
    const venueId = String(formData.get("venueId") ?? "");

    const rows: { dayOfWeek: number; opensAt: number; closesAt: number }[] = [];
    for (let day = 0; day <= 6; day += 1) {
      if (formData.get(`open_${day}`) !== "on") continue;
      const opensAt = clockToMinutes(String(formData.get(`opensAt_${day}`) ?? "09:00"));
      const closesAt = clockToMinutes(String(formData.get(`closesAt_${day}`) ?? "17:00"));
      if (closesAt <= opensAt) {
        return {
          ok: false,
          message: `Closing time must be after opening time on ${DAY_NAMES[day]}.`,
        };
      }
      rows.push({ dayOfWeek: day, opensAt, closesAt });
    }

    await prisma.$transaction(async (tx) => {
      await tx.operatingHours.deleteMany({ where: { venueId } });
      if (rows.length) {
        await tx.operatingHours.createMany({
          data: rows.map((r) => ({ ...r, venueId })),
        });
      }
    });

    await recordAudit({
      actor: user,
      action: "venue.hours_updated",
      entityType: "Venue",
      entityId: venueId,
      metadata: { days: rows.length },
    });

    revalidatePath(`/admin/venues/${venueId}`);
    return { ok: true, message: "Operating hours saved." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function addClosureAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const user = await requireCapability("venues.manage");
    const venueId = String(formData.get("venueId") ?? "");
    const startsAt = new Date(String(formData.get("startsAt") ?? ""));
    const endsAt = new Date(String(formData.get("endsAt") ?? ""));
    const reason = String(formData.get("reason") ?? "").trim();

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { ok: false, message: "Enter valid start and end times." };
    }
    if (endsAt <= startsAt) {
      return { ok: false, message: "The closure must end after it starts." };
    }
    if (!reason) {
      return { ok: false, message: "Record a reason for the closure." };
    }

    await prisma.venueClosure.create({
      data: { venueId, startsAt, endsAt, reason },
    });

    await recordAudit({
      actor: user,
      action: "venue.closure_added",
      entityType: "Venue",
      entityId: venueId,
      metadata: { reason, startsAt, endsAt },
    });

    revalidatePath(`/admin/venues/${venueId}`);
    return { ok: true, message: "Closure recorded." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function removeClosureAction(formData: FormData): Promise<void> {
  await requireCapability("venues.manage");
  const id = String(formData.get("closureId") ?? "");
  const closure = await prisma.venueClosure.findUnique({ where: { id } });
  if (!closure) return;
  await prisma.venueClosure.delete({ where: { id } });
  revalidatePath(`/admin/venues/${closure.venueId}`);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function saveUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const actor = await requireCapability("users.manage");
    const userId = String(formData.get("userId") ?? "");
    const role = String(formData.get("role") ?? "") as Role;
    const isActive = formData.get("isActive") === "on";

    if (!Object.values(Role).includes(role)) {
      return { ok: false, message: "Unknown role." };
    }
    // An administrator must not be able to lock themselves out.
    if (userId === actor.id && (role !== Role.ADMIN || !isActive)) {
      return {
        ok: false,
        message: "You cannot remove your own administrative access.",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role, isActive },
    });

    // Venue managers need at least one assignment to be able to do anything.
    const venueIds = formData.getAll("venueIds").map(String);
    await prisma.venueManager.deleteMany({ where: { userId } });
    if (role === Role.VENUE_MANAGER && venueIds.length) {
      await prisma.venueManager.createMany({
        data: venueIds.map((venueId) => ({ userId, venueId })),
      });
    }

    await recordAudit({
      actor,
      action: "user.updated",
      entityType: "User",
      entityId: userId,
      metadata: { role, isActive, venues: venueIds.length },
    });

    revalidatePath("/admin/users");
    return { ok: true, message: "User updated." };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function createStaffUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    const actor = await requireCapability("users.manage");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("fullName") ?? "").trim();
    const role = String(formData.get("role") ?? "") as Role;
    const password = String(formData.get("password") ?? "");

    if (!z.email().safeParse(email).success) {
      return { ok: false, message: "Enter a valid email address." };
    }
    if (fullName.length < 2) {
      return { ok: false, message: "Enter the person's full name." };
    }
    if (password.length < 10) {
      return { ok: false, message: "Set a password of at least 10 characters." };
    }
    if (!Object.values(Role).includes(role)) {
      return { ok: false, message: "Select a role." };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, message: "That email address is already registered." };
    }

    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        role,
        passwordHash: await hashPassword(password),
        organisation: "The Playhouse Company",
      },
    });

    await recordAudit({
      actor,
      action: "user.created",
      entityType: "User",
      entityId: user.id,
      metadata: { role },
    });

    revalidatePath("/admin/users");
    return { ok: true, message: `${fullName} added as ${role.replace("_", " ").toLowerCase()}.` };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
