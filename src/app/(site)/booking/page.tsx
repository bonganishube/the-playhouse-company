import type { Metadata } from "next";
import { BookingLookup } from "@/components/BookingLookup";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Find a booking" };

export default function BookingLookupPage() {
  return (
    <>
      <PageHero
        title="Find a booking"
        lead="Enter your booking reference and the email address the booking was made under."
      />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <BookingLookup />
      </div>
    </>
  );
}
