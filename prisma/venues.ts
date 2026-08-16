import {
  BookingWorkflow,
  PaymentPolicy,
  PaymentPolicy as PP,
  RateBasis,
  VenueCategory,
} from "../src/generated/prisma/enums";

/**
 * The Playhouse Company venue catalogue and tariff.
 *
 * Source: "VENUE PRICES – FIXED RATES" schedule supplied by The Playhouse
 * Company. Rates are VAT-INCLUSIVE — the figure shown is the figure charged.
 *
 * Theatres and function venues carry a day rate only; rehearsal venues and the
 * recording studio an hourly rate only. That distinction is commercial, not
 * incidental, so it is modelled explicitly via `rateBasis`.
 *
 * OUTSTANDING: capacities, descriptions and photography are placeholders
 * pending approved copy from The Playhouse Company. Every field marked
 * `capacity: null` and every description ending "Details to be confirmed."
 * requires sign-off before go-live.
 */

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

export type VenueSeed = {
  slug: string;
  name: string;
  category: VenueCategory;
  rateBasis: RateBasis;
  /** VAT-inclusive rate, per day or per hour according to rateBasis. */
  rate: string;
  description: string;
  shortInfo: string;
  capacity: number | null;
  sortOrder: number;
  workflow: BookingWorkflow;
  paymentPolicy: PaymentPolicy;
  depositPercent: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minBookingMinutes: number;
  slotIncrementMinutes: number;
  minNoticeHours: number;
  openDays: number[];
  opensAt: number;
  closesAt: number;
  image: string;
};

const PENDING = "Details to be confirmed.";

export const VENUES: VenueSeed[] = [
  // ---------------------------------------------------------------- Theatres
  {
    slug: "opera-theatre",
    name: "Opera",
    category: VenueCategory.THEATRE,
    rateBasis: RateBasis.DAILY,
    rate: "27000.00",
    description:
      "The Playhouse Company's flagship auditorium and the largest of its performance spaces, carrying a full proscenium stage with orchestra pit, fly tower and dressing-room complex. Suited to opera, ballet, large-scale musicals, orchestral concerts and major corporate events. Technical support, front-of-house staffing and box-office services are arranged separately with the production office.",
    shortInfo: "Flagship proscenium auditorium with orchestra pit and fly tower.",
    capacity: null,
    sortOrder: 10,
    workflow: BookingWorkflow.APPROVAL_REQUIRED,
    paymentPolicy: PP.DEPOSIT_ALLOWED,
    depositPercent: 50,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 120,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 168,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 23 * 60,
    image: "/venues/opera-theatre.svg",
  },
  {
    slug: "drama-theatre",
    name: "Drama",
    category: VenueCategory.THEATRE,
    rateBasis: RateBasis.DAILY,
    rate: "15000.00",
    description:
      "A versatile mid-scale theatre designed for drama, dance and chamber productions, offering an intimate audience relationship with the stage while retaining full technical capability. The preferred house for contemporary theatre, festivals and school productions.",
    shortInfo: "Mid-scale house for drama, dance and chamber work.",
    capacity: null,
    sortOrder: 20,
    workflow: BookingWorkflow.APPROVAL_REQUIRED,
    paymentPolicy: PP.DEPOSIT_ALLOWED,
    depositPercent: 50,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 90,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 120,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 23 * 60,
    image: "/venues/drama-theatre.svg",
  },
  {
    slug: "loft-theatre",
    name: "Loft",
    category: VenueCategory.THEATRE,
    rateBasis: RateBasis.DAILY,
    rate: "6500.00",
    description:
      "An adaptable studio-style space with flexible seating, well suited to experimental work, staged readings, workshops and intimate performance. The open floor allows for in-the-round, thrust or traverse configurations.",
    shortInfo: "Flexible studio space with reconfigurable seating.",
    capacity: null,
    sortOrder: 30,
    workflow: BookingWorkflow.INSTANT,
    paymentPolicy: PP.FULL_UPFRONT,
    depositPercent: 50,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 60,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 48,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 22 * 60,
    image: "/venues/loft-theatre.svg",
  },

  // -------------------------------------------------------- Function venues
  {
    slug: "grand-foyer",
    name: "Grand Foyer",
    category: VenueCategory.FUNCTION_VENUE,
    rateBasis: RateBasis.DAILY,
    rate: "27000.00",
    description:
      "The Playhouse's principal reception space, used for launches, exhibitions, conferences, awards evenings and pre-performance functions. Catering may be arranged through the Company's approved suppliers.",
    shortInfo: "Principal reception space for functions and exhibitions.",
    capacity: null,
    sortOrder: 40,
    workflow: BookingWorkflow.APPROVAL_REQUIRED,
    paymentPolicy: PP.DEPOSIT_ALLOWED,
    depositPercent: 40,
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 90,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 96,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 23 * 60,
    image: "/venues/grand-foyer.svg",
  },
  {
    slug: "alhambra",
    name: "Alhambra",
    category: VenueCategory.FUNCTION_VENUE,
    rateBasis: RateBasis.DAILY,
    rate: "14000.00",
    description: `Function venue at The Playhouse Company, available for conferences, receptions and corporate events. ${PENDING}`,
    shortInfo: "Function venue for conferences and receptions.",
    capacity: null,
    sortOrder: 50,
    workflow: BookingWorkflow.APPROVAL_REQUIRED,
    paymentPolicy: PP.DEPOSIT_ALLOWED,
    depositPercent: 40,
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 90,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 96,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 23 * 60,
    image: "/venues/alhambra.svg",
  },
  {
    slug: "vip-room",
    name: "VIP Room",
    category: VenueCategory.FUNCTION_VENUE,
    rateBasis: RateBasis.DAILY,
    rate: "4000.00",
    description: `Private function room at The Playhouse Company, suited to smaller meetings, hospitality and pre-performance receptions. ${PENDING}`,
    shortInfo: "Private room for smaller meetings and hospitality.",
    capacity: null,
    sortOrder: 60,
    workflow: BookingWorkflow.INSTANT,
    paymentPolicy: PP.FULL_UPFRONT,
    depositPercent: 50,
    bufferBeforeMinutes: 30,
    bufferAfterMinutes: 60,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 48,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 23 * 60,
    image: "/venues/vip-room.svg",
  },
  {
    slug: "tudor-room",
    name: "Tudor Room",
    category: VenueCategory.FUNCTION_VENUE,
    rateBasis: RateBasis.DAILY,
    rate: "28000.00",
    description: `Premium function venue at The Playhouse Company, available for banquets, awards evenings and corporate hospitality. ${PENDING}`,
    shortInfo: "Premium function venue for banquets and hospitality.",
    capacity: null,
    sortOrder: 70,
    workflow: BookingWorkflow.APPROVAL_REQUIRED,
    paymentPolicy: PP.DEPOSIT_ALLOWED,
    depositPercent: 40,
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 90,
    minBookingMinutes: 60,
    slotIncrementMinutes: 60,
    minNoticeHours: 96,
    openDays: ALL_DAYS,
    opensAt: 8 * 60,
    closesAt: 23 * 60,
    image: "/venues/tudor-room.svg",
  },

  // ------------------------------------------------------- Rehearsal venues
  ...(
    [
      ["room-503", "Room 503", "390.00", 80],
      ["room-506", "Room 506", "110.00", 90],
      ["room-507", "Room 507", "110.00", 100],
      ["room-508", "Room 508", "110.00", 110],
      ["room-410", "Room 410", "340.00", 120],
      ["room-a1", "Room A1", "260.00", 130],
    ] as const
  ).map(([slug, name, rate, sortOrder]) => ({
    slug,
    name,
    category: VenueCategory.REHEARSAL_VENUE,
    rateBasis: RateBasis.HOURLY,
    rate,
    description: `Rehearsal room at The Playhouse Company, available to resident companies and external hirers for rehearsal, auditions, classes and workshops. ${PENDING}`,
    shortInfo: "Rehearsal room for rehearsal, auditions and workshops.",
    capacity: null,
    sortOrder,
    workflow: BookingWorkflow.INSTANT,
    paymentPolicy: PP.FULL_UPFRONT,
    depositPercent: 50,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    minBookingMinutes: 60,
    slotIncrementMinutes: 30,
    minNoticeHours: 24,
    openDays: MON_TO_SAT,
    opensAt: 7 * 60,
    closesAt: 21 * 60,
    image: "/venues/rehearsal-room.svg",
  })),

  // ------------------------------------------------------- Recording studio
  {
    slug: "studio-3",
    name: "Studio 3",
    category: VenueCategory.RECORDING_STUDIO,
    rateBasis: RateBasis.HOURLY,
    rate: "650.00",
    description: `Recording studio at The Playhouse Company, available for session recording, voice work and production. ${PENDING}`,
    shortInfo: "Recording studio for session recording and voice work.",
    capacity: null,
    sortOrder: 140,
    workflow: BookingWorkflow.INSTANT,
    paymentPolicy: PP.FULL_UPFRONT,
    depositPercent: 50,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    minBookingMinutes: 60,
    slotIncrementMinutes: 30,
    minNoticeHours: 24,
    openDays: MON_TO_SAT,
    opensAt: 8 * 60,
    closesAt: 21 * 60,
    image: "/venues/studio-3.svg",
  },
];

