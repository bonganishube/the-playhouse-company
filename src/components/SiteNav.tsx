"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartIcon } from "./icons";

/**
 * Primary navigation.
 *
 * Two presentations of one menu: a horizontal bar with hover/focus submenus
 * from the medium breakpoint up, and a full-screen drawer below it. The drawer
 * lists submenu entries inline rather than nesting them behind another tap.
 * With four categories there is nothing to gain from hiding them, and nested
 * menus are awkward on touch.
 *
 * Data is passed in from the server component that owns the session and cart
 * lookups, so this stays a thin interactive shell.
 */

export type NavChild = { href: string; label: string };

export function SiteNav({
  cartCount,
  userFirstName,
  isStaff,
  venueLinks,
}: {
  cartCount: number;
  userFirstName: string | null;
  isStaff: boolean;
  venueLinks: NavChild[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Navigating away must dismiss the drawer, or it would cover the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    // Stop the page behind the drawer scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    // Move focus into the drawer so a keyboard user is not left behind it.
    closeButton.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      // Return focus to whatever opened the drawer.
      opener.current?.focus();
    };
  }, [open]);

  const accountHref = userFirstName ? "/account" : "/signin";
  const accountLabel = userFirstName ?? "Sign in";

  return (
    <>
      {/* ------------------------------------------------ desktop navigation */}
      <nav
        className="hidden items-center justify-end pt-14 pb-5 text-[17px] font-medium text-white md:flex"
        aria-label="Primary"
      >
        <NavDropdown
          label="Venues"
          href="/venues"
          items={venueLinks}
          active={isActivePath(pathname, "/venues")}
        />
        <NavLink href="/booking" active={isActivePath(pathname, "/booking")}>
          Find a booking
        </NavLink>
        <NavLink href="/cart" active={isActivePath(pathname, "/cart")}>
          {/* flex, not inline-flex. An inline-level flex box takes its baseline
              from its first flex item, which here is the icon rather than any
              text, so the line box grew to fit both that baseline and its own
              strut. The result was a link 3.7px taller than its neighbours and,
              because the row is centred, a label sitting ~2px above theirs.
              Going block-level takes the span out of inline baseline alignment
              entirely and the heights match. */}
          <span className="flex items-center gap-2">
            <CartWithBadge count={cartCount} />
            Cart
          </span>
        </NavLink>
        {isStaff && (
          <NavLink href="/admin" active={isActivePath(pathname, "/admin")}>
            Admin
          </NavLink>
        )}
        <NavLink href={accountHref} active={isActivePath(pathname, accountHref)}>
          {accountLabel}
        </NavLink>
      </nav>

      {/* -------------------------------------------------- mobile trigger */}
      <div className="flex items-center gap-1 pt-4 pb-4 md:hidden">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-white"
          aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
        >
          <CartWithBadge count={cartCount} className="h-5 w-5" />
        </Link>

        <button
          type="button"
          onClick={(event) => {
            opener.current = event.currentTarget;
            setOpen(true);
          }}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label="Open menu"
          className="inline-flex flex-col justify-center gap-[5px] p-2.5 text-white"
        >
          <span className="block h-0.5 w-6 bg-current" />
          <span className="block h-0.5 w-6 bg-current" />
          <span className="block h-0.5 w-6 bg-current" />
        </button>
      </div>

      {/* --------------------------------------------------- mobile drawer */}
      {open && (
        <div
          id="site-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 z-100 flex flex-col bg-brand-800 md:hidden"
        >
          <div className="flex items-center justify-between border-b border-white/15 px-4 py-4">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">
              Menu
            </span>
            <button
              ref={closeButton}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="p-2 text-3xl leading-none text-white"
            >
              ×
            </button>
          </div>

          <nav
            className="flex-1 overflow-y-auto px-4 py-4"
            aria-label="Primary"
          >
            <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Venues
            </p>
            {venueLinks.map((item) => (
              <DrawerLink key={item.href} href={item.href}>
                {item.label}
              </DrawerLink>
            ))}

            <p className="mt-5 border-t border-white/15 px-2 pt-5 pb-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Your booking
            </p>
            <DrawerLink href="/cart">
              <span className="flex items-center gap-3">
                <CartWithBadge count={cartCount} />
                Cart
              </span>
            </DrawerLink>
            <DrawerLink href="/booking">Find a booking</DrawerLink>
            <DrawerLink href={accountHref}>{accountLabel}</DrawerLink>
            {isStaff && <DrawerLink href="/admin">Admin console</DrawerLink>}
          </nav>

          <div className="border-t border-white/15 px-6 py-4 text-xs text-white/60">
            The Playhouse Company · Durban
            <br />
            bookings@playhousecompany.com
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Cart glyph with the item count sitting on its top-right corner, in the
 * conventional place for a basket badge. The count is positioned absolutely so
 * it overlaps the icon rather than displacing the label beside it.
 */
function CartWithBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <CartIcon className={className} />
      {count > 0 && (
        <span
          className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold leading-none text-ink-900"
          aria-hidden="true"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}


/**
 * Is this link the page currently being viewed?
 *
 * Section matching rather than exact, so a venue detail page still marks
 * "Venues" as current. "/" is excluded from that, or it would match
 * everything and every item would look active at once.
 */
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // The current page wears the hover colour permanently, so the highlight
      // a pointer produces and the one marking your location are the same
      // thing. aria-current carries that to a screen reader, which cannot see
      // the colour at all.
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap px-3 py-2 transition-colors hover:text-gold-400 ${
        active ? "text-gold-400" : ""
      }`}
    >
      {children}
    </Link>
  );
}

function DrawerLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      // Generous height: these are touch targets, not pointer targets.
      className="block rounded-sm px-2 py-3 text-lg text-white hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

/**
 * Desktop submenu. Opens on hover and on keyboard focus, `focus-within`
 * keeps it reachable by tab, which a hover-only menu would not be.
 *
 * Uses `hidden` rather than `invisible`: an invisible absolutely positioned
 * element still contributes to the page's scrollable width.
 */
function NavDropdown({
  label,
  href,
  items,
  active,
}: {
  label: string;
  href: string;
  items: NavChild[];
  active?: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`inline-block whitespace-nowrap px-3 py-2 transition-colors hover:text-gold-400 group-focus-within:text-gold-400 ${
          active ? "text-gold-400" : ""
        }`}
      >
        {label}
      </Link>
      <div className="absolute left-0 top-full z-50 hidden min-w-56 bg-white py-1 shadow-xl group-hover:block group-focus-within:block">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block px-5 py-2.5 text-[15px] font-normal text-ink-900 hover:bg-parchment-100 hover:text-brand-600"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
