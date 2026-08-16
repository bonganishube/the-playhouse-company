import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClosuresPanel,
  OperatingHoursForm,
  VenueForm,
} from "@/components/admin/VenueForms";
import { Card } from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { feedUrl } from "@/lib/calendar/feed";
import { outlookConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/venues/[id]">) {
  const { id } = await params;
  const venue = await prisma.venue.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: venue?.name ?? "Venue" };
}

export default async function AdminVenueDetail({
  params,
}: PageProps<"/admin/venues/[id]">) {
  await requireCapability("venues.manage");
  const { id } = await params;

  const venue = await prisma.venue.findUnique({
    where: { id },
    include: {
      rates: { where: { isActive: true } },
      operatingHours: { orderBy: { dayOfWeek: "asc" } },
      closures: { orderBy: { startsAt: "asc" }, where: { endsAt: { gte: new Date() } } },
    },
  });
  if (!venue) notFound();

  const rate = venue.rates.find(
    (r) => r.kind === (venue.rateBasis === "DAILY" ? "DAILY" : "HOURLY"),
  );

  return (
    <>
      <nav className="mb-4 text-sm text-ink-500">
        <Link href="/admin/venues" className="hover:text-brand-600">
          Venues
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-700">{venue.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl">{venue.name}</h1>
        <Link
          href={`/venues/${venue.slug}`}
          className="text-sm text-brand-600 underline"
        >
          View public page →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <VenueForm
          venue={{
            id: venue.id,
            name: venue.name,
            shortInfo: venue.shortInfo ?? "",
            description: venue.description,
            capacity: venue.capacity,
            location: venue.location ?? "",
            isActive: venue.isActive,
            category: venue.category,
            rateBasis: venue.rateBasis,
            workflow: venue.workflow,
            paymentPolicy: venue.paymentPolicy,
            depositPercent: venue.depositPercent,
            bufferBeforeMinutes: venue.bufferBeforeMinutes,
            bufferAfterMinutes: venue.bufferAfterMinutes,
            minBookingMinutes: venue.minBookingMinutes,
            slotIncrementMinutes: venue.slotIncrementMinutes,
            minNoticeHours: venue.minNoticeHours,
            maxAdvanceDays: venue.maxAdvanceDays,
            rate: rate ? rate.amount.toString() : "0",
            outlookMailbox: venue.outlookMailbox ?? "",
          }}
        />

        <aside className="space-y-6">
          <OperatingHoursForm
            venueId={venue.id}
            hours={venue.operatingHours.map((h) => ({
              dayOfWeek: h.dayOfWeek,
              opensAt: h.opensAt,
              closesAt: h.closesAt,
            }))}
          />

          <ClosuresPanel
            venueId={venue.id}
            closures={venue.closures.map((c) => ({
              id: c.id,
              startsAt: formatDateTime(c.startsAt, venue.timezone),
              endsAt: formatDateTime(c.endsAt, venue.timezone),
              reason: c.reason,
            }))}
          />

          <Card className="p-5">
            <h2 className="mb-1 text-lg">Calendar subscription</h2>
            <p className="mb-3 text-sm text-ink-500">
              {outlookConfigured()
                ? "Microsoft Graph synchronisation is active. This feed is an additional, read-only subscription for clients that cannot use Graph — including an on-premises Exchange organisation."
                : "Microsoft Graph is not configured. Subscribe Outlook to this URL to receive this venue's schedule."}
            </p>
            <code className="block overflow-x-auto border border-parchment-300 bg-parchment-100 p-2 text-xs">
              {feedUrl(venue.slug, venue.id)}
            </code>
            <p className="mt-2 text-xs text-ink-500">
              Treat this URL as confidential — anyone holding it can read this
              venue&apos;s schedule.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
