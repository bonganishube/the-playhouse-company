import { ChatWidget } from "@/components/ChatWidget";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <ChatWidget />
    </>
  );
}
