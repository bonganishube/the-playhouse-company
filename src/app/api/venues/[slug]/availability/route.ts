import { NextResponse } from "next/server";
import { getDayAvailability } from "@/lib/availability";
import { prisma } from "@/lib/prisma";

/**
 * Availability for one venue on one venue-local day.
 *
 * Public and read-only, so it can be called from the embedded portal on The
 * Playhouse Company's website as well as from this application.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const date = new URL(request.url).searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "A date parameter in YYYY-MM-DD format is required." },
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

  const availability = await getDayAvailability(venue.id, date);

  return NextResponse.json(availability, {
    headers: {
      // Availability changes constantly; never let a proxy hold on to it.
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
