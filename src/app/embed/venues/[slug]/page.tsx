import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { DayPicker } from "@/components/DayPicker";
import { Alert } from "@/components/ui";
import { formatMoney, toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EmbedVenuePage({
  params,
}: PageProps<"/embed/venues/[slug]">) {
  const { slug } = await params;

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      rates: { where: { isActive: true } },
    },
  });
  if (!venue || !venue.isActive) notFound();

  const isDaily = venue.rateBasis === "DAILY";
  const rate = venue.rates.find((r) => r.kind === (isDaily ? "DAILY" : "HOURLY"));

  return (
    <div>
      <Link href="/embed" className="text-sm text-brand-600 hover:underline">
        ← All venues
      </Link>

      <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div>
          {venue.images[0] && (
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-parchment-200">
              <Image
                src={venue.images[0].url}
                alt={venue.images[0].alt}
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            </div>
          )}

          <h1 className="mt-4 text-2xl">{venue.name}</h1>
          {venue.capacity && (
            <p className="text-sm text-ink-500">
              Capacity {venue.capacity.toLocaleString("en-ZA")}
              {venue.location && ` · ${venue.location}`}
            </p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-ink-700">
            {venue.description}
          </p>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {rate && (
              <div className="flex justify-between border-b border-parchment-200 pb-1">
                <dt className="text-ink-500">{isDaily ? "Full day" : "Hourly"}</dt>
                <dd className="tabular font-medium">{formatMoney(rate.amount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-b border-parchment-200 pb-1">
              <dt className="text-ink-500">VAT</dt>
              <dd>Included</dd>
            </div>
          </dl>

          {venue.workflow === "APPROVAL_REQUIRED" && (
            <div className="mt-4">
              <Alert tone="warning">
                This venue is confirmed once our venue management team has approved
                your booking.
              </Alert>
            </div>
          )}
        </div>

        {isDaily ? (
          <DayPicker
            venueId={venue.id}
            venueSlug={venue.slug}
            dailyRateCents={rate ? toCents(rate.amount) : 0}
            returnTo="/embed/cart"
          />
        ) : (
          <AvailabilityPicker
            venueId={venue.id}
            venueSlug={venue.slug}
            returnTo="/embed/cart"
            pricing={{
              hourlyCents: rate ? toCents(rate.amount) : null,
              minBookingMinutes: venue.minBookingMinutes,
              maxAdvanceDays: venue.maxAdvanceDays,
              minNoticeHours: venue.minNoticeHours,
              currency: "ZAR",
            }}
          />
        )}
      </div>
    </div>
  );
}
