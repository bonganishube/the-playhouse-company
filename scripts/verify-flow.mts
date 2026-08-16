/**
 * End-to-end verification of the booking lifecycle against the real database.
 *
 * Exercises the paths that carry money and prevent double-bookings, using the
 * MOCK gateway so it runs without any credentials:
 *
 *   1. Slot holds, buffer enforcement and the double-booking guarantee
 *   2. Cart -> booking -> payment -> confirmation (instant workflow)
 *   3. Webhook idempotency and amount-tamper rejection
 *   4. Approval workflow (payment does not confirm; an administrator does)
 *   5. Deposit payments with balance tracking
 *   6. All six reports
 *
 * Run:  pnpm verify
 */
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* environment may be injected directly */
}
process.env.PAYMENT_GATEWAY = "MOCK";

const { prisma } = await import("../src/lib/prisma");
const { addToCart } = await import("../src/lib/cart");
const { checkSlot } = await import("../src/lib/availability");
const {
  approveBooking,
  createBookingFromCart,
  initiatePayment,
  settlePayment,
} = await import("../src/lib/booking");
const { localToUtc, formatRange } = await import("../src/lib/time");
const { toCents, formatCents, vatPortionOfInclusive } = await import("../src/lib/money");
const reports = await import("../src/lib/reports");
const { GatewayId } = await import("../src/generated/prisma/enums");

const TEST_EMAIL = "verify@test.local";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? `, ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}\n${"─".repeat(title.length)}`);
}

/** Remove anything left by a previous run so the script is repeatable. */
async function cleanup() {
  const bookings = await prisma.booking.findMany({
    where: { contactEmail: TEST_EMAIL },
    select: { id: true },
  });
  const ids = bookings.map((b) => b.id);
  if (ids.length) {
    await prisma.reservation.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  }
  const carts = await prisma.cart.findMany({
    where: { sessionId: { startsWith: "verify-" } },
    select: { id: true },
  });
  if (carts.length) {
    await prisma.reservation.deleteMany({
      where: { cartId: { in: carts.map((c) => c.id) } },
    });
    await prisma.cart.deleteMany({ where: { id: { in: carts.map((c) => c.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

async function newCart(tag: string) {
  return prisma.cart.create({ data: { sessionId: `verify-${tag}-${Date.now()}` } });
}

/** A signed-equivalent successful callback, as the gateway would deliver it. */
function successCallback(reference: string, amountCents: number) {
  return {
    verified: true,
    status: "SUCCEEDED" as const,
    reference,
    gatewayReference: `MOCK-${reference}`,
    amountCents,
    raw: { simulated: true },
  };
}

async function main() {
  console.log("\nThe Playhouse Company, booking lifecycle verification");
  console.log("═".repeat(54));

  await cleanup();

  // Room 503 is sold by the hour (R390), the Opera by the day (R27 000).
  const room = await prisma.venue.findUniqueOrThrow({
    where: { slug: "room-503" },
  });
  const opera = await prisma.venue.findUniqueOrThrow({
    where: { slug: "opera-theatre" },
  });

  const customer = await prisma.user.create({
    data: { email: TEST_EMAIL, fullName: "Verification Customer" },
  });

  // Well beyond the longest notice requirement (Opera needs 7 days), and
  // advanced past Sunday, when the rehearsal rooms are closed.
  const dayDate = new Date(Date.now() + 14 * 86_400_000);
  while (dayDate.getUTCDay() === 0) dayDate.setUTCDate(dayDate.getUTCDate() + 1);
  const day = dayDate.toISOString().slice(0, 10);
  const at = (minutes: number) => localToUtc(day, minutes, room.timezone);

  // -----------------------------------------------------------------------
  section("1. Availability, buffers and the double-booking guarantee");

  const cart1 = await newCart("a");
  const first = await addToCart(cart1.id, room.id, at(10 * 60), at(13 * 60));
  check("10:00–13:00 held at Room 503", first.ok);

  const cart2 = await newCart("b");
  const clash = await addToCart(cart2.id, room.id, at(11 * 60), at(13 * 60));
  check(
    "overlapping 11:00–13:00 rejected",
    !clash.ok && clash.code === "ALREADY_BOOKED",
    clash.ok ? "it was accepted" : clash.code,
  );

  // Loft holds 60 minutes after each booking for turnaround.
  const inBuffer = await checkSlot(room.id, at(13 * 60), at(15 * 60));
  check(
    "13:00 start rejected, inside the 30-minute turnaround",
    !inBuffer.ok && inBuffer.code === "ALREADY_BOOKED",
    inBuffer.ok ? "it was accepted" : inBuffer.code,
  );

  const afterBuffer = await addToCart(cart2.id, room.id, at(13 * 60 + 30), at(15 * 60 + 30));
  check("13:30 start accepted, clear of the turnaround", afterBuffer.ok);

  const tooShort = await checkSlot(room.id, at(18 * 60), at(18 * 60 + 30));
  check(
    "30-minute booking rejected, below the 1-hour minimum",
    !tooShort.ok && tooShort.code === "TOO_SHORT",
  );

  const misaligned = await checkSlot(room.id, at(18 * 60 + 10), at(19 * 60 + 10));
  check(
    "18:10 start rejected, off the 30-minute grid",
    !misaligned.ok && misaligned.code === "MISALIGNED",
  );

  const afterHours = await checkSlot(room.id, at(20 * 60 + 30), at(22 * 60 + 30));
  check(
    "20:30–22:30 rejected, beyond the 21:00 close",
    !afterHours.ok && afterHours.code === "OUTSIDE_OPERATING_HOURS",
  );

  // Room 503 requires 24 hours' notice; an hour from now is far inside that.
  const soonDate = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const tooSoon = await checkSlot(
    room.id,
    localToUtc(soonDate, 10 * 60, room.timezone),
    localToUtc(soonDate, 11 * 60, room.timezone),
  );
  check(
    "too-soon booking rejected, inside the notice period",
    !tooSoon.ok && tooSoon.code === "TOO_SOON",
  );

  // -----------------------------------------------------------------------
  section("2. Checkout and instant confirmation");

  const created = await createBookingFromCart(cart1.id, customer.id, {
    contactName: "Verification Customer",
    contactEmail: TEST_EMAIL,
    contactPhone: "031 369 9540",
    eventTitle: "Verification Run",
  });
  check("booking created from cart", created.ok, created.ok ? "" : created.message);
  if (!created.ok) throw new Error("cannot continue without a booking");

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: created.bookingId },
    include: { reservations: true },
  });
  check("reference issued", /^PHC-\d{4}-\d{6}$/.test(booking.reference), booking.reference);
  check("status is PENDING_PAYMENT", booking.status === "PENDING_PAYMENT", booking.status);
  check(
    "slots still held during payment",
    booking.reservations.every((r) => r.status === "PENDING_PAYMENT"),
  );

  const expectedCents = 3 * toCents("390.00"); // 3 hours at R390/hour
  check(
    `charged ${formatCents(toCents(booking.total))} for 3 hours`,
    toCents(booking.total) === expectedCents,
    `expected ${formatCents(expectedCents)}`,
  );

  const { payment } = await initiatePayment(created.bookingId);
  check("payment initiated", payment.status === "PENDING");

  // A tampered amount must never confirm a booking.
  const tampered = await settlePayment(GatewayId.MOCK, {
    ...successCallback(payment.reference, 100),
  });
  check(
    "callback with a mismatched amount refused",
    !tampered.handled && Boolean(tampered.reason?.includes("mismatch")),
    tampered.reason,
  );

  // An unverified callback must never confirm a booking either.
  const unverified = await settlePayment(GatewayId.MOCK, {
    ...successCallback(payment.reference, toCents(payment.amount)),
    verified: false,
    reason: "bad signature",
  });
  check("unverified callback refused", !unverified.handled, unverified.reason);

  const settled = await settlePayment(
    GatewayId.MOCK,
    successCallback(payment.reference, toCents(payment.amount)),
  );
  check("valid callback applied", settled.handled);
  check("booking CONFIRMED on payment", settled.bookingStatus === "CONFIRMED", settled.bookingStatus);

  const replay = await settlePayment(
    GatewayId.MOCK,
    successCallback(payment.reference, toCents(payment.amount)),
  );
  check("replayed callback is idempotent", replay.reason === "Already settled", replay.reason);

  const paidBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: created.bookingId },
    include: { reservations: true, payments: true },
  });
  check("reservations CONFIRMED", paidBooking.reservations.every((r) => r.status === "CONFIRMED"));
  check("paid in full", toCents(paidBooking.amountPaid) === toCents(paidBooking.total));
  check(
    "receipt number issued",
    Boolean(paidBooking.payments[0]?.receiptNumber?.startsWith("RCT-")),
    paidBooking.payments[0]?.receiptNumber ?? "none",
  );
  check("only one payment recorded", paidBooking.payments.length === 1);

  const events = await prisma.paymentEvent.findMany({
    where: { paymentId: payment.id },
  });
  check(
    `audit trail captured every attempt (${events.length} events)`,
    events.length >= 4,
  );

  const emails = await prisma.emailLog.findMany({
    where: { bookingId: created.bookingId },
  });
  check(
    `confirmation and receipt despatched (${emails.map((e) => e.template).join(", ")})`,
    emails.some((e) => e.template === "booking-confirmed") &&
      emails.some((e) => e.template === "payment-receipt"),
  );

  // -----------------------------------------------------------------------
  section("3. Approval workflow and deposit payment");

  const operaCart = await newCart("opera");
  const operaAt = (m: number) => localToUtc(day, m, opera.timezone);
  const operaHold = await addToCart(operaCart.id, opera.id, operaAt(8 * 60), operaAt(23 * 60));
  check("Opera Theatre held for a whole day", operaHold.ok, operaHold.ok ? "" : operaHold.message);

  const operaBooking = await createBookingFromCart(
    operaCart.id,
    customer.id,
    {
      contactName: "Verification Customer",
      contactEmail: TEST_EMAIL,
      contactPhone: "031 369 9540",
      eventTitle: "Gala Evening",
    },
    { payDeposit: true },
  );
  check("deposit booking created", operaBooking.ok, operaBooking.ok ? "" : operaBooking.message);
  if (!operaBooking.ok) throw new Error("cannot continue");

  const opera1 = await prisma.booking.findUniqueOrThrow({
    where: { id: operaBooking.bookingId },
  });
  check(
    "charged the fixed daily rate of R27 000.00",
    toCents(opera1.total) === toCents("27000.00"),
    formatCents(toCents(opera1.total)),
  );
  check(
    "VAT extracted from the inclusive total",
    toCents(opera1.vatAmount) === vatPortionOfInclusive(toCents(opera1.total), 15),
    `${formatCents(toCents(opera1.vatAmount))} of ${formatCents(toCents(opera1.total))}`,
  );
  check(
    "50% deposit required upfront",
    toCents(opera1.amountDue) === toCents(opera1.total) / 2,
    `${formatCents(toCents(opera1.amountDue))} of ${formatCents(toCents(opera1.total))}`,
  );

  const { payment: depositPayment } = await initiatePayment(operaBooking.bookingId);
  const depositSettled = await settlePayment(
    GatewayId.MOCK,
    successCallback(depositPayment.reference, toCents(depositPayment.amount)),
  );
  check(
    "paid booking awaits approval, not confirmed",
    depositSettled.bookingStatus === "PENDING_APPROVAL",
    depositSettled.bookingStatus,
  );

  const opera2 = await prisma.booking.findUniqueOrThrow({
    where: { id: operaBooking.bookingId },
    include: { reservations: true },
  });
  check(
    "balance tracked as outstanding",
    toCents(opera2.total) - toCents(opera2.amountPaid) === toCents(opera2.total) / 2,
  );
  check(
    "slot still held while awaiting approval",
    opera2.reservations.every((r) => r.status === "PENDING_APPROVAL"),
  );

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  await approveBooking(operaBooking.bookingId, {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
  });

  const opera3 = await prisma.booking.findUniqueOrThrow({
    where: { id: operaBooking.bookingId },
    include: { reservations: true },
  });
  check("administrator approval confirms the booking", opera3.status === "CONFIRMED");
  check("approval recorded against the administrator", opera3.approvedById === admin.id);
  check(
    "reservations CONFIRMED after approval",
    opera3.reservations.every((r) => r.status === "CONFIRMED"),
  );

  const audit = await prisma.auditLog.findMany({
    where: { entityType: "Booking", entityId: operaBooking.bookingId },
  });
  check(
    `audit trail records the decision (${audit.map((a) => a.action).join(", ")})`,
    audit.some((a) => a.action === "booking.approved"),
  );

  // -----------------------------------------------------------------------
  section("4. Reports");

  const range = {
    from: new Date(Date.now() - 86_400_000),
    to: new Date(Date.now() + 60 * 86_400_000),
  };

  const byVenue = await reports.bookingsByVenue(range);
  check(`bookings by venue (${byVenue.rows.length} venues)`, byVenue.rows.length >= 2);

  const revenue = await reports.revenueByVenue(range);
  check(
    `revenue by venue. ${formatCents(revenue.totals.invoicedCents)} invoiced, ${formatCents(revenue.totals.collectedCents)} collected`,
    revenue.totals.invoicedCents > 0,
  );

  const history = await reports.customerHistory(range, { email: TEST_EMAIL });
  check(`customer history (${history.rows.length} bookings)`, history.rows.length === 2);

  const cancelled = await reports.cancelledBookings(range);
  check("cancelled bookings runs", Array.isArray(cancelled.rows));

  const outstanding = await reports.outstandingPayments();
  check(
    `outstanding payments. ${formatCents(outstanding.totals.outstandingCents)} across ${outstanding.totals.count}`,
    outstanding.totals.outstandingCents >= toCents(opera3.total) / 2,
  );

  const utilisation = await reports.venueUtilisation(range);
  check(
    `venue utilisation (${utilisation.totals.utilisationPercent}% overall)`,
    utilisation.rows.length > 0,
  );

  // -----------------------------------------------------------------------
  section("Summary");
  const confirmed = await prisma.reservation.findMany({
    where: { booking: { is: { contactEmail: TEST_EMAIL } }, status: "CONFIRMED" },
    include: { venue: true },
    orderBy: { startsAt: "asc" },
  });
  for (const r of confirmed) {
    console.log(`  ${r.venue.name.padEnd(18)} ${formatRange(r.startsAt, r.endsAt, r.venue.timezone)}`);
  }

  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("\nVerification aborted:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
