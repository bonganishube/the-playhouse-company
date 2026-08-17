/**
 * Conditions of hire.
 *
 * Checkout asks every customer to accept these, so they have to exist and it
 * has to be possible to say later exactly which wording someone agreed to. The
 * version below is stamped onto each booking at the moment of purchase, rather
 * than looked up afterwards, because the document will be revised and a
 * dispute turns on what was on screen at the time.
 *
 * IMPORTANT, and deliberately not hidden: the text is a DRAFT. It sets out the
 * clauses a venue hire agreement normally needs and leaves every commercial
 * figure marked for The Playhouse Company to confirm. Nobody should treat it
 * as legal advice or as settled policy. Once the approved wording arrives,
 * replace the clauses, bump CURRENT_TERMS_VERSION, and set `draft` to false.
 * Bookings already taken keep the version they accepted.
 */

export const CURRENT_TERMS_VERSION = "2026-08-draft-1";

/** Until The Playhouse Company's legal team approves the wording. */
export const TERMS_ARE_DRAFT = true;

export const TERMS_EFFECTIVE_DATE = "17 August 2026";

export type Clause = {
  heading: string;
  paragraphs: string[];
  /** Points needing a decision from the client before this can go live. */
  toConfirm?: string[];
};

export const CONDITIONS_OF_HIRE: Clause[] = [
  {
    heading: "1. What these conditions cover",
    paragraphs: [
      "These conditions govern the hire of any venue operated by The Playhouse Company. They apply to every booking made through this website and form part of the agreement between The Playhouse Company and the person or organisation named on the booking, referred to below as the hirer.",
      "Accepting these conditions at checkout creates a binding agreement once the booking is confirmed. Where a separate signed hire agreement exists for an event, that agreement takes precedence over these conditions to the extent of any conflict.",
    ],
  },
  {
    heading: "2. Bookings and confirmation",
    paragraphs: [
      "A booking is a request until The Playhouse Company confirms it. Theatre and function venues require management approval, and the venue is held while that decision is made. Rehearsal rooms and the recording studio are confirmed automatically once payment is received.",
      "Payment taken before approval does not by itself confirm a booking. If approval is refused, the booking is cancelled and all amounts paid are refunded in full.",
      "The published tariff is inclusive of Value Added Tax at the prevailing rate. A tax invoice is issued for every payment received.",
    ],
  },
  {
    heading: "3. Payment",
    paragraphs: [
      "Where a deposit is offered, the balance falls due before the event. The Playhouse Company may treat a booking whose balance is unpaid by the due date as cancelled by the hirer, in which case the cancellation charges below apply.",
      "Access to the venue may be refused where amounts remain outstanding.",
    ],
    toConfirm: [
      "How many days before the event the balance falls due",
      "Whether a refundable damage deposit is required, and how much",
      "Whether interest is charged on overdue amounts, and at what rate",
    ],
  },
  {
    heading: "4. Cancellation by the hirer",
    paragraphs: [
      "A cancellation request must be made in writing, which includes using the cancellation option on the booking page. The date the request is received determines the charge.",
      "Where a booking has not been paid for, it is cancelled immediately at no charge. Where payment has been made, the request is reviewed against the scale below and any refund due is returned to the original method of payment.",
    ],
    toConfirm: [
      "The cancellation scale: what percentage is refundable at each interval before the event",
      "Whether any part of the hire fee is non-refundable in all circumstances",
      "Whether a date may be transferred instead of cancelled, and on what terms",
    ],
  },
  {
    heading: "5. Cancellation by The Playhouse Company",
    paragraphs: [
      "The Playhouse Company may cancel a booking where the venue becomes unavailable, where the event would breach any law or licence condition, or where the hirer is in material breach of these conditions.",
      "Where The Playhouse Company cancels for any reason other than the hirer's breach, all amounts paid are refunded in full. The Playhouse Company is not liable for any further loss, including costs the hirer has incurred in preparing for the event.",
    ],
  },
  {
    heading: "6. Use of the venue",
    paragraphs: [
      "The venue may be used only for the purpose stated on the booking and only during the hours booked. Access before and egress after those hours must be arranged in advance, and the operational buffers applied to each venue are for preparation and turnaround, not additional hire time.",
      "The hirer is responsible for the conduct of everyone attending the event, and must comply with the venue's capacity limits, health and safety requirements, and the instructions of Playhouse staff.",
      "Nothing may be fixed to any surface, and no alteration may be made to the venue, without prior written consent.",
    ],
    toConfirm: [
      "Capacity limits for Rooms 506, 507, 508 and Studio 3, which are not yet recorded",
      "Whether catering and bar service must be arranged through approved suppliers",
      "Noise, licensing and curfew conditions applying to each venue",
    ],
  },
  {
    heading: "7. Damage and liability",
    paragraphs: [
      "The hirer is liable for any damage to the venue, its equipment or its contents caused during the hire period, fair wear and tear excepted.",
      "The Playhouse Company is not liable for loss of or damage to property brought onto the premises by the hirer or those attending the event.",
      "Nothing in these conditions limits liability for death or personal injury caused by negligence, or for any other liability which cannot lawfully be limited.",
    ],
    toConfirm: [
      "Whether the hirer must hold public liability insurance, and for what sum",
    ],
  },
  {
    heading: "8. Personal information",
    paragraphs: [
      "Information provided when booking is processed in accordance with the Protection of Personal Information Act and the privacy notice published on this website. It is used to administer the booking, to issue invoices and receipts, and to contact the hirer about the event.",
    ],
  },
  {
    heading: "9. Governing law",
    paragraphs: [
      "These conditions are governed by the law of the Republic of South Africa, and the parties submit to the jurisdiction of its courts.",
    ],
  },
];

/** Everything still needing a decision, gathered for the client. */
export function outstandingDecisions(): { clause: string; item: string }[] {
  return CONDITIONS_OF_HIRE.flatMap((clause) =>
    (clause.toConfirm ?? []).map((item) => ({ clause: clause.heading, item })),
  );
}
