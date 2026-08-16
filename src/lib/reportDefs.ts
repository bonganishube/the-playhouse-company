import {
  bookingsByVenue,
  cancelledBookings,
  customerHistory,
  outstandingPayments,
  revenueByVenue,
  venueUtilisation,
  type DateRange,
} from "./reports";

/**
 * Report catalogue.
 *
 * Each report is declared once — title, columns and loader — and consumed by
 * both the on-screen table and the CSV export, so the two can never drift.
 */

export type ColumnKind = "text" | "money" | "number" | "percent" | "date" | "status";

export type ReportColumn = {
  key: string;
  label: string;
  kind: ColumnKind;
  align?: "left" | "right";
};

export type ReportResult = {
  rows: Record<string, unknown>[];
  summary: { label: string; value: string | number; kind: ColumnKind }[];
};

export type ReportDefinition = {
  slug: string;
  title: string;
  description: string;
  /** Reports that ignore the date range because they show a live position. */
  liveOnly?: boolean;
  columns: ReportColumn[];
  load: (range: DateRange, options: { email?: string }) => Promise<ReportResult>;
};

export const REPORTS: ReportDefinition[] = [
  {
    slug: "bookings-by-venue",
    title: "Bookings by venue",
    description:
      "Volume of bookings taken for each venue, with the hours reserved and the value of those bookings.",
    columns: [
      { key: "venueName", label: "Venue", kind: "text" },
      { key: "bookings", label: "Bookings", kind: "number", align: "right" },
      { key: "hoursBooked", label: "Hours booked", kind: "number", align: "right" },
      { key: "valueCents", label: "Value", kind: "money", align: "right" },
    ],
    async load(range) {
      const { rows, totals } = await bookingsByVenue(range);
      return {
        rows,
        summary: [
          { label: "Total bookings", value: totals.bookings, kind: "number" },
          { label: "Hours booked", value: totals.hoursBooked, kind: "number" },
          { label: "Total value", value: totals.valueCents, kind: "money" },
        ],
      };
    },
  },
  {
    slug: "revenue-by-venue",
    title: "Revenue by venue",
    description:
      "Value invoiced against each venue and the cash actually settled, apportioned across venues where a booking spans more than one.",
    columns: [
      { key: "venueName", label: "Venue", kind: "text" },
      { key: "invoicedCents", label: "Invoiced", kind: "money", align: "right" },
      { key: "collectedCents", label: "Collected", kind: "money", align: "right" },
      { key: "outstandingCents", label: "Outstanding", kind: "money", align: "right" },
    ],
    async load(range) {
      const { rows, totals } = await revenueByVenue(range);
      return {
        rows,
        summary: [
          { label: "Invoiced", value: totals.invoicedCents, kind: "money" },
          { label: "Collected", value: totals.collectedCents, kind: "money" },
          { label: "Outstanding", value: totals.outstandingCents, kind: "money" },
        ],
      };
    },
  },
  {
    slug: "customer-history",
    title: "Customer booking history",
    description:
      "Every booking placed in the period, with the customer, venues and financial position. Filter by email address for a single customer's history.",
    columns: [
      { key: "reference", label: "Reference", kind: "text" },
      { key: "createdAt", label: "Booked on", kind: "date" },
      { key: "customerName", label: "Customer", kind: "text" },
      { key: "customerEmail", label: "Email", kind: "text" },
      { key: "organisation", label: "Organisation", kind: "text" },
      { key: "venues", label: "Venues", kind: "text" },
      { key: "firstStartsAt", label: "Event date", kind: "date" },
      { key: "status", label: "Status", kind: "status" },
      { key: "totalCents", label: "Total", kind: "money", align: "right" },
      { key: "paidCents", label: "Paid", kind: "money", align: "right" },
    ],
    async load(range, options) {
      const { rows, totals } = await customerHistory(range, { email: options.email });
      return {
        rows,
        summary: [
          { label: "Bookings", value: totals.bookings, kind: "number" },
          { label: "Total value", value: totals.totalCents, kind: "money" },
          { label: "Paid", value: totals.paidCents, kind: "money" },
        ],
      };
    },
  },
  {
    slug: "cancelled",
    title: "Cancelled bookings",
    description:
      "Bookings cancelled or declined in the period, with the reason recorded and any refund due to the customer.",
    columns: [
      { key: "reference", label: "Reference", kind: "text" },
      { key: "cancelledAt", label: "Cancelled on", kind: "date" },
      { key: "customerName", label: "Customer", kind: "text" },
      { key: "venues", label: "Venues", kind: "text" },
      { key: "bookedFor", label: "Was booked for", kind: "date" },
      { key: "status", label: "Outcome", kind: "status" },
      { key: "reason", label: "Reason", kind: "text" },
      { key: "valueCents", label: "Value", kind: "money", align: "right" },
      { key: "refundDueCents", label: "Refund due", kind: "money", align: "right" },
    ],
    async load(range) {
      const { rows, totals } = await cancelledBookings(range);
      return {
        rows,
        summary: [
          { label: "Cancelled", value: totals.count, kind: "number" },
          { label: "Value lost", value: totals.valueCents, kind: "money" },
          { label: "Refunds due", value: totals.refundDueCents, kind: "money" },
        ],
      };
    },
  },
  {
    slug: "outstanding",
    title: "Outstanding payments",
    description:
      "Live position of every booking with money still owing, ordered by how soon the event falls. Deposit bookings appear here until the balance is settled.",
    liveOnly: true,
    columns: [
      { key: "reference", label: "Reference", kind: "text" },
      { key: "customerName", label: "Customer", kind: "text" },
      { key: "customerEmail", label: "Email", kind: "text" },
      { key: "venues", label: "Venues", kind: "text" },
      { key: "bookedFor", label: "Event date", kind: "date" },
      { key: "daysToEvent", label: "Days to event", kind: "number", align: "right" },
      { key: "totalCents", label: "Total", kind: "money", align: "right" },
      { key: "paidCents", label: "Paid", kind: "money", align: "right" },
      { key: "outstandingCents", label: "Outstanding", kind: "money", align: "right" },
    ],
    async load() {
      const { rows, totals } = await outstandingPayments();
      return {
        rows,
        summary: [
          { label: "Bookings with balances", value: totals.count, kind: "number" },
          { label: "Total outstanding", value: totals.outstandingCents, kind: "money" },
        ],
      };
    },
  },
  {
    slug: "utilisation",
    title: "Venue utilisation",
    description:
      "Hours booked against hours available for hire, derived from each venue's operating schedule across the period.",
    columns: [
      { key: "venueName", label: "Venue", kind: "text" },
      { key: "availableHours", label: "Available hours", kind: "number", align: "right" },
      { key: "bookedHours", label: "Booked hours", kind: "number", align: "right" },
      { key: "utilisationPercent", label: "Utilisation", kind: "percent", align: "right" },
      { key: "bookings", label: "Bookings", kind: "number", align: "right" },
      { key: "revenueCents", label: "Value", kind: "money", align: "right" },
    ],
    async load(range) {
      const { rows, totals } = await venueUtilisation(range);
      return {
        rows,
        summary: [
          { label: "Available hours", value: totals.availableHours, kind: "number" },
          { label: "Booked hours", value: totals.bookedHours, kind: "number" },
          { label: "Overall utilisation", value: totals.utilisationPercent, kind: "percent" },
        ],
      };
    },
  },
];

export function findReport(slug: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.slug === slug);
}

/** Default reporting window: the current calendar month to date. */
export function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function parseRange(
  from: string | undefined,
  to: string | undefined,
): DateRange {
  const fallback = defaultRange();
  const fromDate = new Date(`${from || fallback.from}T00:00:00`);
  // Exclusive upper bound covering the whole of the selected end date.
  const toDate = new Date(`${to || fallback.to}T00:00:00`);
  toDate.setDate(toDate.getDate() + 1);
  return { from: fromDate, to: toDate };
}
