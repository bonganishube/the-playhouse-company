import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { can, getVerifiedSession, isStaffRole, type Capability } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; capability: Capability }[] = [
  { href: "/admin", label: "Dashboard", capability: "bookings.view" },
  { href: "/admin/calendar", label: "Booking calendar", capability: "bookings.view" },
  { href: "/admin/bookings", label: "Bookings", capability: "bookings.view" },
  { href: "/admin/payments", label: "Payments", capability: "payments.view" },
  { href: "/admin/reports", label: "Reports", capability: "reports.view" },
  { href: "/admin/venues", label: "Venues", capability: "venues.view" },
  { href: "/admin/users", label: "Users", capability: "users.manage" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getVerifiedSession();
  if (!session) redirect("/signin?next=/admin");
  if (!isStaffRole(session.role)) redirect("/");

  const items = NAV.filter((item) => can(session.role, item.capability));

  return (
    <div className="flex min-h-screen flex-col bg-parchment-100">
      <header className="bg-ink-900 text-white no-print">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/admin" className="font-display text-lg tracking-wide">
              PLAYHOUSE ADMIN
            </Link>
            <span className="text-xs uppercase tracking-widest text-white/50">
              {session.role.replace("_", " ")}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-white/70 hover:text-white">
              View public site
            </Link>
            <span className="text-white/40">|</span>
            <span className="text-white/70">{session.fullName}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-white/70 underline hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
