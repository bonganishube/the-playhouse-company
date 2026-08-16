"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

/**
 * Sliding backdrop for the page hero.
 *
 * Frames advance right to left: the incoming image enters from the right edge
 * as the outgoing one leaves to the left, achieved by translating a horizontal
 * track rather than cross-fading.
 *
 * The first frame is duplicated at the end of the track. Without it, returning
 * from the last frame to the first would rewind the whole track from left to
 * right, visibly reversing direction once per cycle. Instead the track runs on
 * into the duplicate, then silently snaps back to the real first frame with the
 * transition switched off, so motion is always in the one direction.
 *
 * Images are optimised by Next (converted and resized per breakpoint) rather
 * than served raw. The source photography is several megabytes per frame, and
 * a hero shipping all of it at full size would dominate page weight. Only the
 * first frame is given priority; the rest load lazily.
 */
export function HeroSlideshow({
  images,
  intervalMs = 6000,
}: {
  images: string[];
  intervalMs?: number;
}) {
  // Runs 0 … images.length, where the final value is the duplicated frame.
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (images.length < 2 || paused || reducedMotion) return;

    const timer = setInterval(() => {
      // A background tab has nothing to show; leave the position alone.
      if (document.hidden) return;
      // Never run past the duplicate, the snap below returns us to the start.
      setIndex((i) => (i >= images.length ? i : i + 1));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [images.length, intervalMs, paused, reducedMotion]);

  /** Once the duplicate is on screen, jump to the real first frame unseen. */
  const handleTransitionEnd = useCallback(() => {
    if (index === images.length) {
      setAnimate(false);
      setIndex(0);
    }
  }, [index, images.length]);

  // Re-enable the transition only after the browser has painted the snapped
  // position, otherwise the jump back would itself be animated.
  useEffect(() => {
    if (animate) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setAnimate(true)),
    );
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const frames = images.length > 1 ? [...images, images[0]!] : images;
  const activeDot = index % images.length;

  return (
    <div
      className="absolute inset-0 -z-10 overflow-hidden bg-ink-900"
      // Holds the image still while someone reads over it.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`flex h-full w-full ${
          animate && !reducedMotion
            ? "transition-transform duration-700 ease-in-out"
            : ""
        }`}
        style={{ transform: `translateX(-${index * 100}%)` }}
        onTransitionEnd={handleTransitionEnd}
      >
        {frames.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="relative h-full w-full shrink-0 grow-0 basis-full"
          >
            <Image
              src={src}
              alt=""
              aria-hidden="true"
              fill
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-3 right-4 z-10 flex gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              aria-current={i === activeDot}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === activeDot ? "bg-white" : "bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
