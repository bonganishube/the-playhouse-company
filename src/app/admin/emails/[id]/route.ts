import { NextResponse } from "next/server";
import { AuthorisationError, requireCapability } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Renders a recorded message exactly as it was generated.
 *
 * Works whatever the transport, including none at all, so the copy can be read
 * and approved before a mail provider exists. Served from the stored HTML
 * rather than re-rendered, so it shows what the customer actually got.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCapability("bookings.view");
  } catch (error) {
    const status = error instanceof AuthorisationError ? error.status : 403;
    return NextResponse.json({ error: "Not permitted" }, { status });
  }

  const { id } = await params;
  const log = await prisma.emailLog.findUnique({ where: { id } });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(log.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Stored markup from our own templates, but rendered in isolation and
      // never framed, so a template change cannot affect the console.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
