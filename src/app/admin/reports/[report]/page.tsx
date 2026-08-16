import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { requireCapability } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { defaultRange, findReport, parseRange, type ColumnKind } from "@/lib/reportDefs";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/reports/[report]">) {
  const { report } = await params;
  return { title: findReport(report)?.title ?? "Report" };
}

export default async function ReportPage({
  params,
  searchParams,
}: PageProps<"/admin/reports/[report]">) {
  await requireCapability("reports.view");

  const { report: slug } = await params;
  const definition = findReport(slug);
  if (!definition) notFound();

  const query = await searchParams;
  const fallback = defaultRange();
  const from = typeof query.from === "string" ? query.from : fallback.from;
  const to = typeof query.to === "string" ? query.to : fallback.to;
  const email = typeof query.email === "string" ? query.email : undefined;

  const range = parseRange(from, to);
  const { rows, summary } = await definition.load(range, { email });

  const exportParams = new URLSearchParams({ from, to });
  if (email) exportParams.set("email", email);

  return (
    <>
      <nav className="mb-4 text-sm text-ink-500 no-print">
        <Link href="/admin/reports" className="hover:text-brand-600">
          Reports
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-700">{definition.title}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">{definition.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            {definition.description}
          </p>
          {!definition.liveOnly && (
            <p className="mt-1 text-sm text-ink-700">
              {formatDate(range.from)} –{" "}
              {formatDate(new Date(range.to.getTime() - 86_400_000))}
            </p>
          )}
        </div>

        <Link
          href={`/api/admin/reports/${definition.slug}?${exportParams}`}
          className="border border-parchment-300 bg-white px-4 py-2 text-sm hover:bg-parchment-100 no-print"
        >
          Export CSV
        </Link>
      </div>

      {!definition.liveOnly && (
        <form className="mb-5 flex flex-wrap items-end gap-3 border border-parchment-300 bg-white p-4 no-print">
          <label>
            <span className="mb-1 block text-xs font-medium text-ink-700">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="border border-parchment-300 px-3 py-2 text-sm"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-ink-700">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="border border-parchment-300 px-3 py-2 text-sm"
            />
          </label>
          {definition.slug === "customer-history" && (
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-xs font-medium text-ink-700">
                Customer email
              </span>
              <input
                name="email"
                defaultValue={email ?? ""}
                placeholder="Leave blank for all customers"
                className="w-full border border-parchment-300 px-3 py-2 text-sm"
              />
            </label>
          )}
          <button
            type="submit"
            className="bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
          >
            Apply
          </button>
        </form>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {summary.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-sm text-ink-500">{item.label}</p>
            <p className="mt-1 text-xl tabular">
              {formatValue(item.value, item.kind)}
            </p>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No data for this period" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-parchment-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                {definition.columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-2.5 font-medium ${
                      column.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment-200">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-parchment-50">
                  {definition.columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-2.5 ${
                        column.align === "right" ? "text-right tabular" : ""
                      }`}
                    >
                      {column.kind === "status" ? (
                        <StatusBadge status={String(row[column.key] ?? "")} />
                      ) : (
                        formatValue(row[column.key], column.kind)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 text-xs text-ink-500">
        Generated {formatDate(new Date())} · The Playhouse Company venue booking
        platform
      </p>
    </>
  );
}

function formatValue(value: unknown, kind: ColumnKind): string {
  if (value === null || value === undefined || value === "") return ", ";

  switch (kind) {
    case "money":
      return formatCents(Number(value));
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "number":
      return Number(value).toLocaleString("en-ZA");
    case "date":
      return value instanceof Date
        ? formatDate(value)
        : formatDate(new Date(String(value)));
    default:
      return String(value);
  }
}
