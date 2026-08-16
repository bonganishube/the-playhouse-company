import Image from "next/image";
import type { ReactNode } from "react";
import { HeroSlideshow } from "./HeroSlideshow";

/**
 * Full-bleed hero banner sitting beneath the overlaid site header.
 *
 * The translucent header band is laid over the top of this section, so the
 * padding below reserves room for it.
 *
 * Following The Playhouse Company's own site, the page title sits in a dark
 * translucent band rather than directly on the photograph. That is not only a
 * stylistic match: the venue photography ranges from near-black auditoria to
 * brightly lit foyers, and text laid straight onto it would be legible on some
 * frames and not others. The band guarantees contrast whatever is behind it.
 */

/** House photography, used wherever a page has no more specific image. */
export const VENUE_PHOTOGRAPHY = [
  "/venue-pic1.png",
  "/venue-pic2.png",
  "/venue-pic3.png",
  "/venue-pic4.png",
  "/venue-pic5.png",
];

export function PageHero({
  title,
  lead,
  eyebrow,
  size = "default",
  image,
  images,
  action,
  children,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
  /** "tall" for the landing page, "default" for interior pages. */
  size?: "default" | "tall";
  /** A single backdrop image. Ignored when `images` is supplied. */
  image?: string;
  /** Two or more images cross-fade as a slideshow. */
  images?: string[];
  /** Rendered at the right of the title band, e.g. a primary call to action. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  // Interior pages default to a single still. A slideshow is reserved for the
  // landing and venue-listing pages, where cycling the venues is the point.
  const frames = images ?? [image ?? VENUE_PHOTOGRAPHY[0]!];

  const heights =
    size === "tall"
      ? "min-h-[30rem] sm:min-h-[36rem]"
      : "min-h-[20rem] sm:min-h-[24rem]";

  return (
    <section className={`relative isolate flex ${heights} items-end`}>
      {frames.length > 1 ? (
        <HeroSlideshow images={frames} />
      ) : (
        <div className="absolute inset-0 -z-10 overflow-hidden bg-ink-900">
          <Image
            src={frames[0]!}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
            className="object-cover"
            // Venue placeholders are SVG, which the optimiser passes through.
            unoptimized={frames[0]!.endsWith(".svg")}
          />
        </div>
      )}

      {/* Darkens the frame overall so the header navigation stays readable
          against bright photography. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/15 to-black/45"
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-32 sm:pb-14 sm:pt-36">
        <div className="bg-black/60 px-5 py-5 backdrop-blur-[2px] sm:px-8 sm:py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">
                  {eyebrow}
                </p>
              )}
              <h1
                className={`font-display font-bold text-white ${
                  size === "tall"
                    ? "max-w-3xl text-3xl leading-tight sm:text-5xl"
                    : "text-2xl sm:text-4xl"
                }`}
              >
                {title}
              </h1>
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>

          {lead && (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/85">
              {lead}
            </p>
          )}
          {children && <div className="mt-5">{children}</div>}
        </div>
      </div>
    </section>
  );
}
