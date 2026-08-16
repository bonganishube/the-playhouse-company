import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Full-bleed hero banner sitting beneath the overlaid site header.
 *
 * Every public page renders one, because the header is transparent and
 * positioned over it — a page without a hero would leave white navigation on a
 * pale background. The banner is tall enough to clear the logo card, which
 * drops below the top edge.
 *
 * The backdrop is a placeholder standing in for photography of the Playhouse
 * building; replace `image` per page once approved imagery is supplied.
 */
export function PageHero({
  title,
  lead,
  eyebrow,
  size = "default",
  image = "/hero/playhouse.svg",
  children,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
  /** "tall" for the landing page, "default" for interior pages. */
  size?: "default" | "tall";
  image?: string;
  children?: ReactNode;
}) {
  const heights =
    size === "tall"
      ? "min-h-[26rem] sm:min-h-[32rem]"
      : "min-h-[15rem] sm:min-h-[18rem]";

  return (
    <section className={`relative isolate flex ${heights} items-end`}>
      <Image
        src={image}
        alt=""
        fill
        priority
        unoptimized
        aria-hidden="true"
        className="-z-10 object-cover"
      />
      {/* Deepens the lower half so white text stays legible over any image. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/25 to-black/70"
      />

      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-28 sm:pb-12 sm:pt-32">
        {eyebrow && (
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gold-300">
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-display text-white ${
            size === "tall"
              ? "max-w-3xl text-4xl leading-tight sm:text-5xl"
              : "text-3xl sm:text-4xl"
          }`}
        >
          {title}
        </h1>
        {lead && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/85">
            {lead}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
