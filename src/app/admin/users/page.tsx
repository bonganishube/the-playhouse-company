import { CreateStaffUser, UserRow } from "@/components/admin/UserForms";
import { Card } from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "Users" };

export default async function AdminUsersPage() {
  await requireCapability("users.manage");

  const [users, venues] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      include: {
        managedVenues: { select: { venueId: true } },
        _count: { select: { bookings: true } },
      },
    }),
    prisma.venue.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const staff = users.filter((u) => u.role !== "CUSTOMER");
  const customers = users.filter((u) => u.role === "CUSTOMER");

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl">Users and access</h1>
        <p className="mt-1 text-sm text-ink-500">
          Roles determine what each person may do. Venue managers are additionally
          restricted to the venues assigned to them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="border-b border-parchment-300 px-4 py-3 text-lg">
              Staff ({staff.length})
            </h2>
            <ul className="divide-y divide-parchment-200">
              {staff.map((user) => (
                <UserRow
                  key={user.id}
                  venues={venues}
                  user={{
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    isActive: user.isActive,
                    managedVenueIds: user.managedVenues.map((m) => m.venueId),
                    bookingCount: user._count.bookings,
                  }}
                />
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="border-b border-parchment-300 px-4 py-3 text-lg">
              Customers ({customers.length})
            </h2>
            {customers.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-500">
                No customer accounts yet.
              </p>
            ) : (
              <ul className="divide-y divide-parchment-200">
                {customers.slice(0, 50).map((user) => (
                  <UserRow
                    key={user.id}
                    venues={venues}
                    user={{
                      id: user.id,
                      email: user.email,
                      fullName: user.fullName,
                      role: user.role,
                      isActive: user.isActive,
                      managedVenueIds: [],
                      bookingCount: user._count.bookings,
                    }}
                  />
                ))}
              </ul>
            )}
            {customers.length > 50 && (
              <p className="border-t border-parchment-200 px-4 py-2 text-xs text-ink-500">
                Showing the first 50 of {customers.length} customer accounts.
              </p>
            )}
          </Card>
        </div>

        <aside>
          <CreateStaffUser />
        </aside>
      </div>
    </>
  );
}
