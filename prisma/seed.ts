import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { RateBasis, RateKind, Role } from "../src/generated/prisma/enums";
import { VENUES } from "./venues";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Environment may be injected directly.
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Seed data for The Playhouse Company.
 *
 * Venues and tariffs come from the supplied "VENUE PRICES – FIXED RATES"
 * schedule (see ./venues.ts). Rates are VAT-inclusive.
 */

const USERS = [
  {
    email: "admin@playhousecompany.com",
    fullName: "System Administrator",
    role: Role.ADMIN,
    password: "Playhouse#Admin1",
  },
  {
    email: "venues@playhousecompany.com",
    fullName: "Nomsa Dlamini",
    role: Role.VENUE_MANAGER,
    password: "Playhouse#Venue1",
  },
  {
    email: "finance@playhousecompany.com",
    fullName: "Rajesh Naidoo",
    role: Role.FINANCE,
    password: "Playhouse#Finance1",
  },
  {
    email: "frontdesk@playhousecompany.com",
    fullName: "Thabo Mkhize",
    role: Role.STAFF,
    password: "Playhouse#Staff1",
  },
  {
    email: "customer@example.co.za",
    fullName: "Ayanda Zulu",
    role: Role.CUSTOMER,
    password: "Customer#1234",
  },
];

async function main() {
  console.log("\nSeeding The Playhouse Company booking platform\n");

  // --- Users -------------------------------------------------------------
  const users: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, role: u.role },
      create: {
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 12),
        organisation:
          u.role === Role.CUSTOMER
            ? "Durban Arts Collective"
            : "The Playhouse Company",
      },
    });
    users[u.email] = user.id;
  }
  console.log(`  ${USERS.length} users`);

  // --- Venues ------------------------------------------------------------
  const seededSlugs = VENUES.map((v) => v.slug);

  for (const v of VENUES) {
    const shared = {
      name: v.name,
      description: v.description,
      shortInfo: v.shortInfo,
      capacity: v.capacity,
      location: "231 Anton Lembede Street, Durban",
      sortOrder: v.sortOrder,
      category: v.category,
      rateBasis: v.rateBasis,
      workflow: v.workflow,
      paymentPolicy: v.paymentPolicy,
      depositPercent: v.depositPercent,
      bufferBeforeMinutes: v.bufferBeforeMinutes,
      bufferAfterMinutes: v.bufferAfterMinutes,
      minBookingMinutes: v.minBookingMinutes,
      slotIncrementMinutes: v.slotIncrementMinutes,
      minNoticeHours: v.minNoticeHours,
      isActive: true,
    };

    const venue = await prisma.venue.upsert({
      where: { slug: v.slug },
      update: shared,
      create: { slug: v.slug, ...shared },
    });

    await prisma.venueImage.deleteMany({ where: { venueId: venue.id } });
    await prisma.venueImage.create({
      data: {
        venueId: venue.id,
        url: v.image,
        alt: `${v.name} at The Playhouse Company`,
        isPrimary: true,
        sortOrder: 0,
      },
    });

    // Exactly one rate, of the kind the venue is actually sold by. A venue
    // must never carry a rate it is not commercially offered at.
    await prisma.venueRate.deleteMany({ where: { venueId: venue.id } });
    await prisma.venueRate.create({
      data: {
        venueId: venue.id,
        kind: v.rateBasis === RateBasis.DAILY ? RateKind.DAILY : RateKind.HOURLY,
        label:
          v.rateBasis === RateBasis.DAILY
            ? "Full-day hire (incl. VAT)"
            : "Hourly hire (incl. VAT)",
        amount: v.rate,
        currency: "ZAR",
      },
    });

    await prisma.operatingHours.deleteMany({ where: { venueId: venue.id } });
    await prisma.operatingHours.createMany({
      data: v.openDays.map((dayOfWeek) => ({
        venueId: venue.id,
        dayOfWeek,
        opensAt: v.opensAt,
        closesAt: v.closesAt,
      })),
    });
  }

  // Retire anything not in the tariff schedule. Deactivated rather than
  // deleted, so historical bookings and reporting remain intact.
  const retired = await prisma.venue.updateMany({
    where: { slug: { notIn: seededSlugs }, isActive: true },
    data: { isActive: false },
  });

  // --- Venue manager assignments ----------------------------------------
  const managerId = users["venues@playhousecompany.com"]!;
  const allVenues = await prisma.venue.findMany({ select: { id: true } });
  for (const venue of allVenues) {
    await prisma.venueManager.upsert({
      where: { userId_venueId: { userId: managerId, venueId: venue.id } },
      update: {},
      create: { userId: managerId, venueId: venue.id },
    });
  }

  // --- Reporting ---------------------------------------------------------
  const byCategory = await prisma.venue.groupBy({
    by: ["category", "rateBasis"],
    where: { isActive: true },
    _count: true,
  });

  console.log(`  ${VENUES.length} venues from the fixed tariff schedule`);
  for (const row of byCategory) {
    console.log(
      `    ${row.category.replace(/_/g, " ").padEnd(18)} ${String(row._count).padStart(2)} venues, ${row.rateBasis.toLowerCase()} rate`,
    );
  }
  if (retired.count > 0) {
    console.log(`  ${retired.count} venue(s) not in the schedule deactivated`);
  }

  console.log("\n  Sign-in credentials");
  for (const u of USERS) {
    console.log(`    ${u.role.padEnd(14)} ${u.email.padEnd(34)} ${u.password}`);
  }
  console.log(
    "\n  Rates are VAT-inclusive at 15%. Capacities, descriptions and\n" +
      "  photography are placeholders pending approved copy.\n",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
