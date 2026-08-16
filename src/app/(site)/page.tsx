import Image from "next/image";
import Link from "next/link";
import { PageHero, VENUE_PHOTOGRAPHY } from "@/components/PageHero";
import { ButtonLink } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { rateUnit } from "@/lib/venueCategories";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The home page shows a representative selection; the full catalogue,
  // grouped by category, lives at /venues.
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    take: 6,
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      rates: { where: { isActive: true }, take: 1 },
    },
  });

  const totalVenues = await prisma.venue.count({ where: { isActive: true } });

  return (
    <>
      <PageHero
        size="tall"
        images={VENUE_PHOTOGRAPHY}
        title="Hire a stage worthy of the occasion."
        lead="From the Opera Theatre to a rehearsal room, The Playhouse Company's venues are available for performance, conference, function and rehearsal hire. Check availability, reserve your dates and pay securely online."
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/venues" variant="secondary">
            Browse venues &amp; availability
          </ButtonLink>
          <ButtonLink
            href="/booking"
            variant="secondary"
            className="!border-white/40 !bg-transparent !text-white hover:!bg-white/10"
          >
            Look up an existing booking
          </ButtonLink>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl">Our venues</h2>
            <p className="mt-1 text-sm text-ink-500">
              Rates are inclusive of VAT and cover venue hire only. Technical
              staffing, equipment and catering are quoted separately.
            </p>
          </div>
          <Link
            href="/venues"
            className="text-sm text-brand-600 hover:underline whitespace-nowrap"
          >
            View all {totalVenues} venues →
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => {
            const rate = venue.rates[0];
            return (
              <Link
                key={venue.id}
                href={`/venues/${venue.slug}`}
                className="group block border border-parchment-300 bg-white transition-shadow hover:shadow-lg"
              >
                <div className="relative aspect-[8/5] overflow-hidden bg-parchment-200">
                  {venue.images[0] && (
                    <Image
                      src={venue.images[0].url}
                      alt={venue.images[0].alt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  {venue.capacity && (
                    <span className="absolute top-3 right-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur-[2px]">
                      {venue.capacity.toLocaleString("en-ZA")}
                      <span className="font-normal text-white/75"> capacity</span>
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg text-ink-900">{venue.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">
                    {venue.shortInfo ?? venue.description}
                  </p>
                  {rate && (
                    <p className="mt-3 text-sm text-ink-700">
                      <span className="font-semibold tabular">
                        {formatMoney(rate.amount)}
                      </span>{" "}
                      {rateUnit(venue.rateBasis)}
                      <span className="text-ink-500"> incl. VAT</span>
                    </p>
                  )}
                  {venue.workflow === "APPROVAL_REQUIRED" && (
                    <p className="mt-2 text-xs text-amber-800">
                      Subject to management approval
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-parchment-300 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          {[
            {
              title: "Live availability",
              body: "Every venue's calendar is live. Slots already taken, including turnaround time between events, are never offered twice.",
            },
            {
              title: "Secure payment",
              body: "Pay in full or by deposit through South African payment gateways. A receipt and calendar invitation follow immediately.",
            },
            {
              title: "Confirmed in writing",
              body: "You receive a booking reference on checkout and written confirmation once your booking is final.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="text-lg">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-500">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
