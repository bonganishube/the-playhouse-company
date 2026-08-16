import { EmbedAutoResize } from "@/components/EmbedAutoResize";

/**
 * Chrome-free layout for the portal embedded in The Playhouse Company's
 * website. No site header or footer, the host page provides those, and the
 * background is transparent so the portal adopts the surrounding design.
 */
export default function EmbedLayout({ children }: LayoutProps<"/embed">) {
  return (
    <div className="min-h-0 bg-transparent">
      <EmbedAutoResize />
      <div className="px-3 py-4">{children}</div>
    </div>
  );
}
