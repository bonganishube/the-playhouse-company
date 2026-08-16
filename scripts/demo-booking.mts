/**
 * Creates one confirmed booking and lets the real confirmation flow run.
 *
 * Useful for checking that a live mail provider actually delivers. The booking
 * is left in place so it can be inspected in the admin console.
 *
 * Run:  pnpm demo:booking
 */
import path from "node:path";
try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}
process.env.PAYMENT_GATEWAY = "MOCK";

const { prisma } = await import("../src/lib/prisma");
const { addToCart } = await import("../src/lib/cart");
const { createBookingFromCart, initiatePayment, settlePayment } = await import("../src/lib/booking");
const { localToUtc, formatRange } = await import("../src/lib/time");
const { toCents, formatCents } = await import("../src/lib/money");
const { GatewayId } = await import("../src/generated/prisma/enums");

const venue = await prisma.venue.findUniqueOrThrow({ where: { slug: "studio-3" } });
const user = await prisma.user.upsert({
  where: { email: "demo.customer@example.co.za" },
  update: {},
  create: { email: "demo.customer@example.co.za", fullName: "Demo Customer", organisation: "Durban Arts Collective" },
});

const cart = await prisma.cart.create({ data: { sessionId: `demo-${Date.now()}` } });
const d = new Date(Date.now() + 18 * 86_400_000);
while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
const day = d.toISOString().slice(0, 10);

const held = await addToCart(cart.id, venue.id, localToUtc(day, 600, venue.timezone), localToUtc(day, 780, venue.timezone));
if (!held.ok) { console.error("could not hold the slot:", held.message); process.exit(1); }

const created = await createBookingFromCart(cart.id, user.id, {
  contactName: "Demo Customer",
  contactEmail: "demo.customer@example.co.za",
  contactPhone: "031 369 9555",
  organisation: "Durban Arts Collective",
  eventTitle: "Voice recording session",
});
if (!created.ok) { console.error(created.message); process.exit(1); }

const { payment } = await initiatePayment(created.bookingId);
await settlePayment(GatewayId.MOCK, {
  verified: true, status: "SUCCEEDED",
  reference: payment.reference, gatewayReference: "DEMO",
  amountCents: toCents(payment.amount), raw: { demo: true },
});

const booking = await prisma.booking.findUniqueOrThrow({
  where: { id: created.bookingId },
  include: { reservations: { include: { venue: true } } },
});
const mail = await prisma.emailLog.findMany({
  where: { bookingId: booking.id }, orderBy: { createdAt: "asc" },
});

console.log(`\n  ${booking.reference}   ${booking.status}`);
for (const r of booking.reservations) {
  console.log(`  ${r.venue.name} · ${formatRange(r.startsAt, r.endsAt, r.venue.timezone)}`);
}
console.log(`  ${formatCents(toCents(booking.total))} incl. VAT ${formatCents(toCents(booking.vatAmount))}`);
console.log("\n  Messages generated:");
for (const m of mail) {
  console.log(`    ${m.status.padEnd(15)} ${m.subject}`);
  if (m.error) console.log(`                    ${m.error}`);
}
console.log("");
await prisma.$disconnect();
