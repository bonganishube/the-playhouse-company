import { RateBasis, VenueCategory } from "@/generated/prisma/enums";

/**
 * Presentation of the venue catalogue, mirroring the groupings in The
 * Playhouse Company's fixed tariff schedule.
 */

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  [VenueCategory.THEATRE]: "Theatres",
  [VenueCategory.FUNCTION_VENUE]: "Function venues",
  [VenueCategory.REHEARSAL_VENUE]: "Rehearsal venues",
  [VenueCategory.RECORDING_STUDIO]: "Recording studio",
};

export const CATEGORY_BLURBS: Record<VenueCategory, string> = {
  [VenueCategory.THEATRE]:
    "Performance houses hired by the day, at a fixed daily rate.",
  [VenueCategory.FUNCTION_VENUE]:
    "Reception and event spaces hired by the day, at a fixed daily rate.",
  [VenueCategory.REHEARSAL_VENUE]:
    "Rehearsal rooms hired by the hour, from one hour upwards.",
  [VenueCategory.RECORDING_STUDIO]:
    "Studio facilities hired by the hour, from one hour upwards.",
};

/** Order the categories appear in on the public listing. */
export const CATEGORY_ORDER: VenueCategory[] = [
  VenueCategory.THEATRE,
  VenueCategory.FUNCTION_VENUE,
  VenueCategory.REHEARSAL_VENUE,
  VenueCategory.RECORDING_STUDIO,
];

/** "per day" / "per hour", for rate display. */
export function rateUnit(basis: RateBasis): string {
  return basis === RateBasis.DAILY ? "per day" : "per hour";
}

/** Group venues by category, preserving CATEGORY_ORDER and dropping empties. */
export function groupByCategory<T extends { category: VenueCategory }>(
  venues: T[],
): { category: VenueCategory; label: string; blurb: string; venues: T[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    blurb: CATEGORY_BLURBS[category],
    venues: venues.filter((v) => v.category === category),
  })).filter((group) => group.venues.length > 0);
}
