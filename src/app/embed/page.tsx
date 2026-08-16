import Image from "next/image";
import Link from "next/link";
import { ReservationStatus } from "@/generated/prisma/enums";
import { findCart } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { rateUnit } from "@/lib/venueCategories";

export const dynamic = "force-dynamic";

export const metadata = { title: "Book a venue" };

export default async function EmbedIndex() {
  const [venues, cart] = await Promise.all([
    prisma.venue.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        // A venue carries exactly one active rate, of the kind it is sold by.
        rates: { where: { isActive: true }, take: 1 },
      },
    }),
    findCart(),
  ]);

  const held = cart
    ? await prisma.reservation.count({
        where: { cartId: cart.id, status: ReservationStatus.HELD },
      })
    : 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl">Book a venue</h1>
        {held > 0 && (
          <Link
            href="/embed/cart"
            className="bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
          >
            View cart ({held})
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue) => (
          <Link
            key={venue.id}
            href={`/embed/venues/${venue.slug}`}
            className="group block border border-parchment-300 bg-white transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-[8/5] overflow-hidden bg-parchment-200">
              {venue.images[0] && (
                <Image
                  src={venue.images[0].url}
                  alt={venue.images[0].alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </div>
            <div className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base">{venue.name}</h2>
                {venue.capacity && (
                  <span className="text-xs text-ink-500">{venue.capacity}</span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-500">
                {venue.shortInfo ?? venue.description}
              </p>
              {venue.rates[0] && (
                <p className="mt-2 text-sm">
                  <span className="tabular font-semibold">
                    {formatMoney(venue.rates[0].amount)}
                  </span>
                  <span className="text-ink-500">
                    {" "}
                    {rateUnit(venue.rateBasis)}
                  </span>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
