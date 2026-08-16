import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

/**
 * Montserrat, matching the typeface used across The Playhouse Company's own
 * website. A geometric sans used for both headings and body copy.
 */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Venue Bookings. The Playhouse Company",
    template: "%s. The Playhouse Company",
  },
  description:
    "Browse, reserve and pay for venue hire at The Playhouse Company, Durban.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZA" className={`${montserrat.variable} h-full`}>
      <body id="top" className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
