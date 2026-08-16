import Link from "next/link";
import { Card } from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { REPORTS, defaultRange } from "@/lib/reportDefs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

export default async function ReportsIndex() {
  await requireCapability("reports.view");
  const range = defaultRange();

  return (
    <>
      <h1 className="mb-1 text-2xl">Reports</h1>
      <p className="mb-6 text-sm text-ink-500">
        Every report can be filtered by date range and exported to CSV for further
        analysis or submission.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.slug} className="p-5">
            <h2 className="text-lg">
              <Link
                href={`/admin/reports/${report.slug}?from=${range.from}&to=${range.to}`}
                className="hover:text-brand-600"
              >
                {report.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-ink-500">{report.description}</p>
            {report.liveOnly && (
              <p className="mt-2 text-xs text-amber-800">
                Shows the current position; not restricted by date range.
              </p>
            )}
            <Link
              href={`/admin/reports/${report.slug}?from=${range.from}&to=${range.to}`}
              className="mt-3 inline-block text-sm text-brand-600 underline"
            >
              Open report →
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
