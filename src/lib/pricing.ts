import { RateBasis, RateKind } from "@/generated/prisma/enums";
import { toCents, fromCents } from "./money";
import { minutesBetween } from "./time";

export type RateRow = {
  id: string;
  kind: RateKind;
  label: string;
  amount: unknown; // Prisma Decimal
  currency: string;
  isActive: boolean;
  validFrom: Date | null;
  validTo: Date | null;
};

export type Quote = {
  rateKind: RateKind;
  rateLabel: string;
  /** Unit price in cents (per hour or per day). */
  rateCents: number;
  /** Number of units charged — hours (2dp) or whole days. */
  quantity: number;
  /** quantity x rateCents, in cents. */
  lineTotalCents: number;
  currency: string;
  durationMinutes: number;
};

/** Rates in force at a given instant. */
export function activeRates(rates: RateRow[], at: Date = new Date()): RateRow[] {
  return rates.filter(
    (r) =>
      r.isActive &&
      (!r.validFrom || r.validFrom <= at) &&
      (!r.validTo || r.validTo >= at),
  );
}

export function findRate(
  rates: RateRow[],
  kind: RateKind,
  at: Date = new Date(),
): RateRow | undefined {
  return activeRates(rates, at).find((r) => r.kind === kind);
}

/**
 * Price a booking window.
 *
 * The venue's `rateBasis` decides how it is sold, reflecting The Playhouse
 * Company's fixed tariff:
 *
 *   DAILY  — theatres and function venues. A fixed charge per calendar day,
 *            regardless of how much of the day is used. One day of the Opera
 *            Theatre costs the day rate whether the hirer needs four hours or
 *            fourteen.
 *   HOURLY — rehearsal rooms and the recording studio, billed to two decimal
 *            places so a 90-minute session is 1.5 hours.
 *
 * All rates are VAT-inclusive; the VAT portion is extracted at booking level,
 * not per line, so the tax invoice reconciles exactly to the total.
 */
export function quote(
  venue: {
    rateBasis: RateBasis;
  },
  rates: RateRow[],
  startsAt: Date,
  endsAt: Date,
  at: Date = new Date(),
): Quote {
  const durationMinutes = minutesBetween(startsAt, endsAt);
  if (durationMinutes <= 0) {
    throw new Error("Booking must cover a positive duration");
  }

  const available = activeRates(rates, at);
  const wanted =
    venue.rateBasis === RateBasis.DAILY ? RateKind.DAILY : RateKind.HOURLY;
  const rate = available.find((r) => r.kind === wanted);

  if (!rate) {
    throw new Error(
      `This venue has no active ${wanted.toLowerCase()} rate configured.`,
    );
  }

  const rateCents = toCents(rate.amount as never);

  if (venue.rateBasis === RateBasis.DAILY) {
    // A part-day hire is still a full day. Multi-day hires are booked as one
    // reservation per date, so this is normally exactly one day.
    const days = Math.max(1, Math.ceil(durationMinutes / 1440));
    return {
      rateKind: RateKind.DAILY,
      rateLabel: rate.label,
      rateCents,
      quantity: days,
      lineTotalCents: rateCents * days,
      currency: rate.currency,
      durationMinutes,
    };
  }

  const hours = Math.round((durationMinutes / 60) * 100) / 100;
  return {
    rateKind: RateKind.HOURLY,
    rateLabel: rate.label,
    rateCents,
    // Rounded to the cent so the stored line total always reconciles.
    quantity: hours,
    lineTotalCents: Math.round(rateCents * hours),
    currency: rate.currency,
    durationMinutes,
  };
}

/** Shape a quote for persistence as a Reservation pricing snapshot. */
export function quoteToReservationFields(q: Quote) {
  return {
    rateKind: q.rateKind,
    rateAmount: fromCents(q.rateCents),
    rateLabel: q.rateLabel,
    quantity: q.quantity.toFixed(2),
    lineTotal: fromCents(q.lineTotalCents),
    currency: q.currency,
  };
}
