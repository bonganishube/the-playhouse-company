import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHero, VENUE_PHOTOGRAPHY } from "@/components/PageHero";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { minutesToClock } from "@/lib/time";
import { groupByCategory, rateUnit } from "@/lib/venueCategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Venues",
  description:
    "Theatres, function venues, rehearsal rooms and recording facilities available for hire at The Playhouse Company, Durban.",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function VenuesPage() {
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      rates: { where: { isActive: true } },
      operatingHours: { orderBy: { dayOfWeek: "asc" } },
    },
  });

  const groups = groupByCategory(venues);

  return (
    <>
      <PageHero
        images={VENUE_PHOTOGRAPHY}
        title="Venues for hire"
        lead="From the Opera Theatre to a rehearsal room, The Playhouse Company's spaces are available for performance, conference, function and rehearsal hire. Select a venue to check live availability and reserve your dates."
      />

      <div className="mx-auto max-w-6xl px-4 py-10">

      <p className="mb-8 border-l-4 border-parchment-400 bg-white px-4 py-3 text-sm text-ink-700">
        All rates are <strong>inclusive of VAT</strong> and cover venue hire only.
        Technical staffing, equipment hire, catering and box-office services are
        quoted separately.
      </p>

      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {groups.map((group) => (
          <a
            key={group.category}
            href={`#${group.category.toLowerCase()}`}
            className="border border-parchment-300 bg-white px-3 py-1.5 hover:border-brand-400 hover:text-brand-600"
          >
            {group.label}
            <span className="ml-1.5 text-ink-500">{group.venues.length}</span>
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        {groups.map((group) => (
          <section key={group.category} id={group.category.toLowerCase()}>
            <div className="mb-4 border-b border-parchment-300 pb-2">
              <h2 className="text-2xl">{group.label}</h2>
              <p className="mt-0.5 text-sm text-ink-500">{group.blurb}</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.venues.map((venue) => {
                const rate = venue.rates[0];
                const openDays = venue.operatingHours;

                return (
                  <article
                    key={venue.id}
                    className="flex flex-col border border-parchment-300 bg-white transition-shadow hover:shadow-md"
                  >
                    <Link
                      href={`/venues/${venue.slug}`}
                      className="relative aspect-[8/5] overflow-hidden bg-parchment-200"
                    >
                      {venue.images[0] && (
                        <Image
                          src={venue.images[0].url}
                          alt={venue.images[0].alt}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover"
                        />
                      )}
                      {/* Capacity overlaid on the image, where it reads as a
                          property of the space rather than another line of
                          copy. Omitted entirely when unknown, rather than
                          showing a placeholder figure. */}
                      {venue.capacity && (
                        <span className="absolute top-3 right-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur-[2px]">
                          {venue.capacity.toLocaleString("en-ZA")}
                          <span className="font-normal text-white/75"> capacity</span>
                        </span>
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="text-lg">
                        <Link
                          href={`/venues/${venue.slug}`}
                          className="hover:text-brand-600"
                        >
                          {venue.name}
                        </Link>
                      </h3>

                      <p className="mt-1 line-clamp-2 text-sm text-ink-500">
                        {venue.shortInfo ?? venue.description}
                      </p>

                      {rate && (
                        <p className="mt-3 text-ink-900">
                          <span className="tabular text-lg font-semibold">
                            {formatMoney(rate.amount)}
                          </span>
                          <span className="text-sm text-ink-500">
                            {" "}
                            {rateUnit(venue.rateBasis)}
                          </span>
                        </p>
                      )}

                      <div className="mt-2 space-y-0.5 text-xs text-ink-500">
                        {venue.rateBasis === "HOURLY" ? (
                          <p>
                            Minimum {formatDuration(venue.minBookingMinutes)} ·{" "}
                            {venue.slotIncrementMinutes}-minute increments
                          </p>
                        ) : (
                          <p>Fixed daily rate, whatever the hours used</p>
                        )}
                        {openDays.length > 0 && <p>{summariseHours(openDays)}</p>}
                        <p>Notice required: {formatNotice(venue.minNoticeHours)}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {venue.workflow === "APPROVAL_REQUIRED" && (
                          <span className="text-amber-800">
                            Subject to approval
                          </span>
                        )}
                        {venue.paymentPolicy === "DEPOSIT_ALLOWED" && (
                          <span className="text-ink-500">
                            {venue.depositPercent}% deposit accepted
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/venues/${venue.slug}`}
                        className="mt-4 block bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
                      >
                        Check availability
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        </div>
      </div>
    </>
  );
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${m} minutes`;
}

function formatNotice(hours: number): string {
  if (hours === 0) return "none";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hours`;
}

/** Collapse identical daily schedules into a readable summary. */
function summariseHours(
  hours: { dayOfWeek: number; opensAt: number; closesAt: number }[],
): string {
  const identical = hours.every(
    (h) => h.opensAt === hours[0]!.opensAt && h.closesAt === hours[0]!.closesAt,
  );
  const window = `${minutesToClock(hours[0]!.opensAt)}–${minutesToClock(hours[0]!.closesAt)}`;

  if (identical && hours.length === 7) return `Open daily, ${window}`;
  if (identical) {
    return `${hours.map((h) => DAY_LABELS[h.dayOfWeek]).join(", ")}, ${window}`;
  }
  return hours
    .map(
      (h) =>
        `${DAY_LABELS[h.dayOfWeek]} ${minutesToClock(h.opensAt)}–${minutesToClock(h.closesAt)}`,
    )
    .join("; ");
}
