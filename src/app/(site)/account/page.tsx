import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { signOutAction } from "@/app/actions/auth";
import { PageHero } from "@/components/PageHero";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  StatusBadge,
} from "@/components/ui";
import { getVerifiedSession } from "@/lib/auth";
import { formatCents, toCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatDate, formatRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/signin?next=/account");

  const bookings = await prisma.booking.findMany({
    where: { userId: session.id },
    include: {
      reservations: { include: { venue: true }, orderBy: { startsAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHero title="Your bookings" lead={`Signed in as ${session.email}`}>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="!border-white/40 !bg-transparent !text-white hover:!bg-white/10"
          >
            Sign out
          </Button>
        </form>
      </PageHero>

      <div className="mx-auto max-w-4xl px-4 py-10">

      {bookings.length === 0 ? (
        <EmptyState title="You have no bookings yet">
          <div className="mt-4">
            <ButtonLink href="/venues" size="sm">
              Browse venues
            </ButtonLink>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const outstanding =
              toCents(booking.total) - toCents(booking.amountPaid);
            return (
              <Card key={booking.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/booking/${booking.reference}`}
                      className="font-mono text-lg hover:text-brand-600"
                    >
                      {booking.reference}
                    </Link>
                    <p className="text-sm text-ink-500">
                      Booked {formatDate(booking.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {booking.reservations.map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-2">
                      <span className="text-ink-900">{r.venue.name}</span>
                      <span className="text-ink-500">
                        {formatRange(r.startsAt, r.endsAt, r.venue.timezone)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-parchment-200 pt-3 text-sm">
                  <span className="tabular">
                    Total {formatCents(toCents(booking.total), booking.currency)}
                    {outstanding > 0 && (
                      <span className="ml-2 text-brand-700">
                        · {formatCents(outstanding, booking.currency)} outstanding
                      </span>
                    )}
                  </span>
                  <Link
                    href={`/booking/${booking.reference}`}
                    className="text-brand-600 underline"
                  >
                    View details
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
