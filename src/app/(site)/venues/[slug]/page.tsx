import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { DayPicker } from "@/components/DayPicker";
import { PageHero } from "@/components/PageHero";
import { Alert, Card, DetailRow } from "@/components/ui";
import { toCents, formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatDate, minutesToClock } from "@/lib/time";
import { CATEGORY_LABELS } from "@/lib/venueCategories";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function loadVenue(slug: string) {
  return prisma.venue.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      rates: { where: { isActive: true } },
      operatingHours: { orderBy: { dayOfWeek: "asc" } },
      closures: {
        where: { endsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 6,
      },
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps<"/venues/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: { name: true, shortInfo: true },
  });
  if (!venue) return { title: "Venue not found" };
  return { title: venue.name, description: venue.shortInfo ?? undefined };
}

export default async function VenuePage({ params }: PageProps<"/venues/[slug]">) {
  const { slug } = await params;
  const venue = await loadVenue(slug);
  if (!venue || !venue.isActive) notFound();

  // A venue carries exactly one active rate, of the kind it is sold by.
  const isDaily = venue.rateBasis === "DAILY";
  const rate = venue.rates.find((r) => r.kind === (isDaily ? "DAILY" : "HOURLY"));
  const hero = venue.images[0];

  return (
    <>
      {/* The venue's own image serves as the hero backdrop. */}
      <PageHero
        eyebrow={CATEGORY_LABELS[venue.category]}
        title={venue.name}
        lead={venue.location ?? undefined}
        image={hero?.url ?? "/hero/playhouse.svg"}
      />

      <div className="mx-auto max-w-7xl px-4 py-10">
      <nav className="mb-6 text-sm text-ink-500">
        <Link href="/venues" className="hover:text-brand-600">
          Venues
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-700">{venue.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="space-y-4 text-[15px] leading-relaxed text-ink-700">
            {venue.description.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {venue.workflow === "APPROVAL_REQUIRED" && (
            <div className="mt-6">
              <Alert tone="warning" title="This venue requires approval">
                Your dates are reserved and payment taken at checkout, but the booking
                becomes final only once our venue management team has approved it. You
                will be notified by email, usually within two working days. Should the
                booking not be approved, your payment is refunded in full.
              </Alert>
            </div>
          )}

          {venue.closures.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg">Scheduled closures</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {venue.closures.map((closure) => (
                  <li key={closure.id} className="flex flex-wrap gap-2">
                    <span className="tabular text-ink-900">
                      {formatDate(closure.startsAt, venue.timezone)}
                      {closure.endsAt.getTime() - closure.startsAt.getTime() > 86_400_000 &&
                        ` – ${formatDate(closure.endsAt, venue.timezone)}`}
                    </span>
                    <span className="text-ink-500">{closure.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          {isDaily ? (
            <DayPicker
              venueId={venue.id}
              venueSlug={venue.slug}
              dailyRateCents={rate ? toCents(rate.amount) : 0}
            />
          ) : (
            <AvailabilityPicker
              venueId={venue.id}
              venueSlug={venue.slug}
              pricing={{
                hourlyCents: rate ? toCents(rate.amount) : null,
                minBookingMinutes: venue.minBookingMinutes,
                maxAdvanceDays: venue.maxAdvanceDays,
                currency: "ZAR",
              }}
            />
          )}

          <Card className="p-4">
            <h2 className="mb-2 text-lg">Rates &amp; conditions</h2>
            <dl>
              {rate && (
                <DetailRow label={isDaily ? "Full-day hire" : "Hourly hire"}>
                  <span className="tabular font-medium">
                    {formatMoney(rate.amount)}
                  </span>
                </DetailRow>
              )}
              <DetailRow label="VAT">Included in the rate shown</DetailRow>
              {isDaily ? (
                <DetailRow label="Basis">
                  Fixed daily rate, whatever the hours used
                </DetailRow>
              ) : (
                <>
                  <DetailRow label="Minimum hire">
                    {formatDuration(venue.minBookingMinutes)}
                  </DetailRow>
                  <DetailRow label="Booking increments">
                    {venue.slotIncrementMinutes} minutes
                  </DetailRow>
                </>
              )}
              {venue.capacity && (
                <DetailRow label="Capacity">
                  {venue.capacity.toLocaleString("en-ZA")}
                </DetailRow>
              )}
              <DetailRow label="Notice required">
                {formatNotice(venue.minNoticeHours)}
              </DetailRow>
              {(venue.bufferBeforeMinutes > 0 || venue.bufferAfterMinutes > 0) && (
                <DetailRow label="Turnaround held">
                  {[
                    venue.bufferBeforeMinutes > 0 &&
                      `${venue.bufferBeforeMinutes} min before`,
                    venue.bufferAfterMinutes > 0 &&
                      `${venue.bufferAfterMinutes} min after`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </DetailRow>
              )}
              <DetailRow label="Payment">
                {venue.paymentPolicy === "DEPOSIT_ALLOWED"
                  ? `${venue.depositPercent}% deposit, or pay in full`
                  : "Payable in full at checkout"}
              </DetailRow>
            </dl>
            <p className="mt-3 text-xs text-ink-500">
              Rates exclude technical staffing, equipment hire, catering and box-office
              services, which are quoted separately.
            </p>
          </Card>

          {venue.operatingHours.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 text-lg">Opening hours</h2>
              <dl>
                {venue.operatingHours.map((hours) => (
                  <DetailRow key={hours.id} label={DAY_LABELS[hours.dayOfWeek]!}>
                    <span className="tabular">
                      {minutesToClock(hours.opensAt)} – {minutesToClock(hours.closesAt)}
                    </span>
                  </DetailRow>
                ))}
              </dl>
            </Card>
          )}
        </aside>
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
  if (hours === 0) return "None";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hours`;
}
