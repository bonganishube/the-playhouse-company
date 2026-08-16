import Image from "next/image";
import Link from "next/link";
import { ReservationStatus } from "@/generated/prisma/enums";
import { getSession, isStaffRole } from "@/lib/auth";
import { findCart } from "@/lib/cart";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/venueCategories";

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
 * Follows the pattern of The Playhouse Company's own website: the navigation
 * is laid over the page's hero image rather than sitting in a bar of its own,
 * and the logo occupies a white card that drops from the top edge. Every page
 * therefore renders a <PageHero> as its first element, which the header sits
 * on top of.
 */
export async function SiteHeader() {
  const [session, count] = await Promise.all([getSession(), cartCount()]);

  return (
    <header className="absolute inset-x-0 top-0 z-50 no-print">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-6 px-4">
        {/* White card, flush with the top edge and overhanging the hero. */}
        <Link
          href="/"
          className="shrink-0 rounded-b-xl bg-white px-5 pt-3 pb-3 shadow-lg"
          aria-label="The Playhouse Company — venue bookings, home"
        >
          <Image
            src="/playhouse_logo_svg_bg.svg"
            alt="The Playhouse Company — an agency of the Department of Sport, Arts and Culture"
            width={7758}
            height={4282}
            priority
            // Static SVG: served as-is rather than through the image optimiser.
            unoptimized
            className="h-14 w-auto sm:h-16"
          />
        </Link>

        <nav
          className="flex flex-wrap items-center justify-end gap-x-1 gap-y-1 py-5 text-sm font-medium text-white"
          aria-label="Primary"
        >
          <NavDropdown label="Venues" href="/venues">
            {CATEGORY_ORDER.map((category) => (
              <DropdownLink
                key={category}
                href={`/venues#${category.toLowerCase()}`}
              >
                {CATEGORY_LABELS[category]}
              </DropdownLink>
            ))}
            <DropdownLink href="/venues">All venues</DropdownLink>
          </NavDropdown>

          <NavLink href="/booking">Find a booking</NavLink>

          <NavLink href="/cart">
            Cart
            {count > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1.5 text-xs font-semibold text-ink-900">
                {count}
              </span>
            )}
          </NavLink>

          {session && isStaffRole(session.role) && (
            <NavLink href="/admin">Admin</NavLink>
          )}

          {session ? (
            <NavLink href="/account">{session.fullName.split(" ")[0]}</NavLink>
          ) : (
            <NavLink href="/signin">Sign in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-2 transition-colors hover:text-gold-400"
    >
      {children}
    </Link>
  );
}

/**
 * Navigation item with a submenu.
 *
 * Opens on hover and on keyboard focus — `focus-within` keeps it reachable by
 * tab, which a hover-only menu would not be.
 */
function NavDropdown({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        className="inline-block px-3 py-2 transition-colors hover:text-gold-400 group-focus-within:text-gold-400"
      >
        {label}
      </Link>
      <div className="invisible absolute left-0 top-full z-50 min-w-56 bg-white py-1 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {children}
      </div>
    </div>
  );
}

function DropdownLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block px-5 py-2.5 text-[15px] font-normal text-ink-900 hover:bg-parchment-100 hover:text-brand-600"
    >
      {children}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-parchment-300 bg-white no-print">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-ink-500">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            {/* Reproduced larger here than in the header so the departmental
                endorsement carried in the lock-up is legible. */}
            <Image
              src="/playhouse_logo_svg_bg.svg"
              alt="The Playhouse Company — an agency of the Department of Sport, Arts and Culture"
              width={7758}
              height={4282}
              unoptimized
              className="h-24 w-auto"
            />
            <p className="mt-3">
              231 Anton Lembede Street
              <br />
              Durban, 4001
            </p>
          </div>
          <div>
            <p className="font-medium text-ink-700">Bookings</p>
            <ul className="mt-1 space-y-1">
              <li>
                <Link href="/venues" className="hover:text-brand-600">
                  Browse venues
                </Link>
              </li>
              <li>
                <Link href="/booking" className="hover:text-brand-600">
                  Look up a booking
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink-700">Enquiries</p>
            <p className="mt-1">bookings@playhousecompany.com</p>
          </div>
        </div>
        <p className="mt-8 border-t border-parchment-200 pt-4 text-xs">
          © {new Date().getFullYear()} The Playhouse Company. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
