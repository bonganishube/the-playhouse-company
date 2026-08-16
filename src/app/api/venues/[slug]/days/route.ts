import { NextResponse } from "next/server";
import { getDayOptions } from "@/lib/availability";
import { prisma } from "@/lib/prisma";

/**
 * Whole-day availability for a venue sold at a fixed daily rate.
 *
 * Public and read-only, so the embedded portal on The Playhouse Company's
 * website can call it directly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const search = new URL(request.url).searchParams;
  const from = search.get("from");
  const to = search.get("to");

  const isDate = (v: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!isDate(from) || !isDate(to)) {
    return NextResponse.json(
      { error: "from and to parameters in YYYY-MM-DD format are required." },
      { status: 400 },
    );
  }

  // Bound the window so a crafted request cannot ask for years of data.
  const span =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(span) || span < 0 || span > 62) {
    return NextResponse.json(
      { error: "The requested range must be between 0 and 62 days." },
      { status: 400 },
    );
  }

  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  });
  if (!venue || !venue.isActive) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  const result = await getDayOptions(venue.id, from!, to!);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
