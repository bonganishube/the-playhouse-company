import Image from "next/image";
import Link from "next/link";
import { ReservationStatus } from "@/generated/prisma/enums";
import { getSession, isStaffRole } from "@/lib/auth";
import { findCart } from "@/lib/cart";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/venueCategories";
import {
  FaFacebookF,
  FaInstagram,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { ChevronUpIcon } from "./icons";
import { NewsletterForm } from "./NewsletterForm";
import { SiteNav } from "./SiteNav";

async function cartCount(): Promise<number> {
  const cart = await findCart();
  if (!cart) return 0;
  return prisma.reservation.count({
    where: { cartId: cart.id, status: ReservationStatus.HELD },
  });
}

/**
 * Site header.
 *
 * Follows the pattern of The Playhouse Company's own website: a deep indigo
 * navigation sits over the page hero behind a translucent purple wash, with
 * the logo occupying a white card hanging from the top edge. The wash is light
 * enough for the photograph to read through it, and dense enough to hold white
 * type legible over the brightest frame in the slideshow.
 *
 * Session and cart lookups stay here on the server; <SiteNav> is the client
 * shell that needs state for the small-screen drawer.
 */
export async function SiteHeader() {
  const [session, count] = await Promise.all([getSession(), cartCount()]);

  return (
    <header className="header-gradient absolute inset-x-0 top-0 z-50 no-print">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-6 px-4">
        {/* The logo is used exactly as supplied, it carries its own white
            panel and rounded lower corners, so no wrapper background, border
            or shadow is added. It hangs from the very top of the band. */}
        <Link
          href="/"
          className="shrink-0"
          aria-label="The Playhouse Company, venue bookings, home"
        >
          <Image
            src="/playhouse_logo_svg_bg.svg"
            alt="The Playhouse Company. An agency of the Department of Sport, Arts and Culture"
            width={7758}
            height={4282}
            priority
            // Static SVG: served as-is rather than through the image optimiser.
            unoptimized
            className="h-20 w-auto sm:h-[7.5rem]"
          />
        </Link>

        <SiteNav
          cartCount={count}
          userFirstName={session ? session.fullName.split(" ")[0]! : null}
          isStaff={Boolean(session && isStaffRole(session.role))}
          venueLinks={[
            ...CATEGORY_ORDER.map((category) => ({
              href: `/venues#${category.toLowerCase()}`,
              label: CATEGORY_LABELS[category],
            })),
            { href: "/venues", label: "All venues" },
          ]}
        />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-sunflower-400 text-ink-900 no-print">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-6">
        {/* Columns are sized to their content: the address and department
            list is the widest, the link list the narrowest. */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.05fr_0.85fr_1.3fr]">
          {/* ------------------------------------------- identity & social */}
          <div>
            {/* The transparent footer variant of the lock-up, so it sits
                directly on the yellow with no white panel behind it. */}
            <Image
              src="/playhouse_logo_agency_svg_footer.svg"
              alt="The Playhouse Company, an agency of the Department of Sport, Arts and Culture"
              width={3901}
              height={2041}
              unoptimized
              className="h-24 w-auto"
            />

            <ul className="mt-5 flex gap-3">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`The Playhouse Company on ${social.label}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-sunflower-400 transition-transform duration-150 hover:scale-110 hover:bg-black"
                  >
                    <social.Icon className={social.size} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ------------------------------------------------------ sitemap */}
          <nav aria-label="Footer">
            <h2 className={FOOTER_HEADING}>Bookings</h2>
            <ul className="text-[15px] leading-7">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-red-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ------------------------------------------------------ contact */}
          <div className="text-[15px]">
            <h2 className={FOOTER_HEADING}>The Playhouse Company</h2>
            <address className="not-italic leading-7">
              231 Anton Lembede Street
              <br />
              Durban, KZN, RSA
              <br />
              {/* break-words so the address wraps rather than widening the
                  column, which it is long enough to do on small screens. */}
              <a
                href="mailto:bookings@playhousecompany.com"
                className="break-words transition-colors hover:text-red-700"
              >
                bookings@playhousecompany.com
              </a>
            </address>

            {/* mt-5 rather than mt-6: with the heading's own line box and
                margin this makes the block 56px, a multiple of the 28px line
                rhythm, so the department rows stay on the same baseline grid
                as the address above and the link column alongside. */}
            <h2 className={`${FOOTER_HEADING} mt-5`}>Departments</h2>
            <ul className="leading-7">
              {DEPARTMENTS.map((department) => (
                <li key={department.label}>
                  {department.label}:{" "}
                  <a
                    href={`tel:${department.tel.replace(/[^+\d]/g, "")}`}
                    className="whitespace-nowrap transition-colors hover:text-red-700"
                  >
                    {department.tel}
                    {department.alt && `/${department.alt}`}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Subscription sits in the same container as the columns above, so its
          edges line up rather than stepping inward. */}
      <div className="mx-auto max-w-6xl px-4 pb-6">
        <NewsletterForm />
      </div>

      {/* ---------------------------------------------------------- legal */}
      <div className="border-t border-black/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-sm">
          <p>
            © {new Date().getFullYear()} The Playhouse Company. All rights
            reserved.
          </p>
          <p className="flex items-center gap-3">
            <Link href="/privacy" className="transition-colors hover:text-red-700">
              Privacy
            </Link>
            <span aria-hidden="true" className="text-ink-900/30">
              |
            </span>
            <Link
              href="/conditions-of-hire"
              className="transition-colors hover:text-red-700"
            >
              Conditions of Hire
            </Link>
            <span aria-hidden="true">|</span>
            <Link href="/terms" className="transition-colors hover:text-red-700">
              Terms of Use
            </Link>
          </p>
        </div>
      </div>

      {/* Plain anchor rather than a scroll handler: works without JavaScript,
          and honours the reader's reduced-motion preference through the
          scroll-behavior rule in globals.css. */}
      <a
        href="#top"
        aria-label="Back to top"
        className="fixed right-0 bottom-0 z-40 flex h-12 w-12 items-center justify-center bg-ink-900 text-white transition-colors hover:bg-black"
      >
        <ChevronUpIcon />
      </a>
    </footer>
  );
}

/** Shared heading treatment, so the three columns start on one baseline. */
const FOOTER_HEADING =
  "mb-2 text-xs font-bold leading-7 uppercase tracking-[0.18em] text-ink-900/70";

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/playhousecompany",
    Icon: FaFacebookF,
    size: "h-[17px] w-[17px]",
  },
  {
    label: "X",
    href: "https://x.com/playhousecoza",
    Icon: FaXTwitter,
    size: "h-[17px] w-[17px]",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/playhousecompany",
    Icon: FaInstagram,
    size: "h-[19px] w-[19px]",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@theplayhousecompany",
    Icon: FaYoutube,
    size: "h-[19px] w-[19px]",
  },
];

/**
 * Booking-portal routes only. The wider site's sections (What's On, Gallery,
 * Tenders and so on) live on playhousecompany.com and are deliberately not
 * guessed at here. A footer full of broken links is worse than a short one.
 */
const FOOTER_LINKS = [
  { href: "/venues", label: "Venue Hire" },
  { href: "/venues#theatre", label: "Theatres" },
  { href: "/venues#function_venue", label: "Function Venues" },
  { href: "/venues#rehearsal_venue", label: "Rehearsal Venues" },
  { href: "/venues#recording_studio", label: "Recording Studio" },
  { href: "/booking", label: "Find a Booking" },
  { href: "/cart", label: "Your Cart" },
  { href: "/signin", label: "Sign In" },
];

const DEPARTMENTS = [
  { label: "Central Switchboard", tel: "+27 31 369 9555" },
  { label: "Box Office", tel: "+27 31 369 9596", alt: "40" },
  { label: "Front of House Manager", tel: "+27 31 369 9527" },
  { label: "Recording Studio", tel: "+27 31 369 9520" },
  { label: "Theatre Venue Hire", tel: "+27 31 369 9461" },
  { label: "Arts Department", tel: "+27 31 369 9460", alt: "9463" },
];
