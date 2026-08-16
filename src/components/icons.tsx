/**
 * Inline SVG icons.
 *
 * Interface glyphs, drawn to suit their use here. Brand marks are NOT drawn by
 * hand. Those come from react-icons, which carries each company's official
 * path data. An approximated logo is both visibly wrong and, for a trademark,
 * inappropriate to redraw.
 *
 * Everything is bundled rather than fetched: the Content Security Policy
 * permits no external origins.
 *
 * All icons inherit `currentColor` and size from the surrounding text unless a
 * className overrides it.
 */

type IconProps = { className?: string };

export function CartIcon({ className = "h-[1.05em] w-[1.05em]" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 3h2.2l2.2 11.2a1.8 1.8 0 0 0 1.8 1.4h8.4a1.8 1.8 0 0 0 1.8-1.4L20.5 7H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </svg>
  );
}

export function ChevronUpIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 15l7-7 7 7" />
    </svg>
  );
}
