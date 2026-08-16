/**
 * Money handling.
 *
 * All arithmetic happens in integer cents. Values cross the Prisma boundary as
 * decimal strings, which Postgres stores as NUMERIC(12,2). Floating point is
 * never used for a monetary calculation.
 */

export type DecimalLike = { toString(): string } | string | number;

/** Convert a value read from the database (or a literal) into integer cents. */
export function toCents(value: DecimalLike): number {
  const asString = typeof value === "string" ? value : value.toString();
  const negative = asString.trim().startsWith("-");
  const [whole, fraction = ""] = asString.trim().replace(/^[-+]/, "").split(".");
  const cents =
    Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -cents : cents;
}

/** Render integer cents as a decimal string suitable for a Prisma Decimal. */
export function fromCents(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Format integer cents for display, e.g. 125000 -> "R 1 250.00". */
export function formatCents(cents: number, currency = "ZAR"): string {
  const formatted = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
  // en-ZA renders ZAR as "R", using a non-breaking space we normalise for width.
  return formatted.replace(/ /g, " ");
}

/** Format a value straight from the database for display. */
export function formatMoney(value: DecimalLike, currency = "ZAR"): string {
  return formatCents(toCents(value), currency);
}

/**
 * Apply a percentage to an amount, rounding to the nearest cent. Used for
 * deposit calculation, where the balance is always the remainder so that
 * deposit + balance reconciles exactly to the total.
 */
export function percentOfCents(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/**
 * The VAT portion of a VAT-inclusive amount.
 *
 * The Playhouse Company's published tariff is VAT-inclusive, so the amount a
 * customer pays is the amount advertised. A valid tax invoice must still state
 * the VAT separately, which is what this extracts:
 *
 *   VAT = inclusive x rate / (100 + rate)
 *
 * At 15%, R27 000.00 inclusive contains R3 521.74 of VAT.
 */
export function vatPortionOfInclusive(
  inclusiveCents: number,
  ratePercent: number,
): number {
  return Math.round((inclusiveCents * ratePercent) / (100 + ratePercent));
}

/** The amount excluding VAT, given a VAT-inclusive figure. */
export function exclusiveOfVat(
  inclusiveCents: number,
  ratePercent: number,
): number {
  return inclusiveCents - vatPortionOfInclusive(inclusiveCents, ratePercent);
}
