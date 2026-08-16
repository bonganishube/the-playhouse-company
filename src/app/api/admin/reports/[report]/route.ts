import { NextResponse } from "next/server";
import { AuthorisationError, requireCapability } from "@/lib/auth";
import { findReport, parseRange } from "@/lib/reportDefs";
import { toCsv } from "@/lib/reports";
import { formatDate } from "@/lib/time";

/**
 * CSV export of any report in the catalogue. Columns and data come from the
 * same definition the on-screen table uses, so an export always matches what
 * was displayed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  try {
    await requireCapability("reports.view");
  } catch (error) {
    const status = error instanceof AuthorisationError ? error.status : 403;
    return NextResponse.json({ error: "Not permitted" }, { status });
  }

  const { report: slug } = await params;
  const definition = findReport(slug);
  if (!definition) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  const search = new URL(request.url).searchParams;
  const from = search.get("from") ?? undefined;
  const to = search.get("to") ?? undefined;
  const email = search.get("email") ?? undefined;

  const range = parseRange(from, to);
  const { rows } = await definition.load(range, { email });

  // Money is exported in rands with two decimals rather than cents, so the
  // file opens correctly in a spreadsheet without further conversion.
  const prepared = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const column of definition.columns) {
      const value = row[column.key];
      if (column.kind === "money") {
        out[column.key] = (Number(value ?? 0) / 100).toFixed(2);
      } else if (column.kind === "date" && value) {
        out[column.key] = formatDate(
          value instanceof Date ? value : new Date(String(value)),
        );
      } else {
        out[column.key] = value ?? "";
      }
    }
    return out;
  });

  const csv = toCsv(
    prepared,
    definition.columns.map((c) => ({
      key: c.key,
      label: c.kind === "money" ? `${c.label} (ZAR)` : c.label,
    })),
  );

  const filename = definition.liveOnly
    ? `playhouse-${definition.slug}-${new Date().toISOString().slice(0, 10)}.csv`
    : `playhouse-${definition.slug}-${from}-to-${to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
