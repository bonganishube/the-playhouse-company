import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers, and the framing policy that makes the embedded portal
 * possible.
 *
 * Everything except /embed is denied framing outright. The /embed routes are
 * framable, but only by the origins listed in EMBED_ALLOWED_ORIGINS, so The
 * Playhouse Company's own website can host the booking portal while a third
 * party cannot frame it to mount a clickjacking attack against customers.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isEmbed = request.nextUrl.pathname.startsWith("/embed");

  const allowed = (process.env.EMBED_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // In development, allow the portal to be framed locally for integration work.
  if (process.env.NODE_ENV !== "production") {
    allowed.push("http://localhost:*", "http://127.0.0.1:*");
  }

  const frameAncestors =
    isEmbed && allowed.length > 0 ? `'self' ${allowed.join(" ")}` : "'none'";

  // React's development build uses eval() for debugging features such as
  // reconstructing call stacks. It never does so in production, so the
  // allowance is confined to development and the shipped policy stays strict.
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts and Tailwind inline styles.
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Payment gateways are reached by redirecting the browser, not by XHR.
      "connect-src 'self'",
      "form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors ${frameAncestors}`,
    ].join("; "),
  );

  if (!isEmbed) {
    response.headers.set("X-Frame-Options", "DENY");
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

export const config = {
  // Static assets do not need these headers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|venues/.*\\.svg).*)"],
};
