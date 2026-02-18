import Script from "next/script";
import { SalesAnimation } from "@/components/SalesAnimation";

export default function WaitlistPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative z-10">
      <SalesAnimation />
      <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white text-center">
        Ledger
      </h1>
      <p className="mt-4 text-lg sm:text-xl text-gray-300 text-center max-w-md">
        the world&apos;s first zero-fee trading card exchange
      </p>
      <div className="mt-10 w-full max-w-md">
        <div
          id="getWaitlistContainer"
          data-waitlist_id="32523"
          data-widget_type="WIDGET_2"
        />
      </div>
      <Script
        src="https://prod-waitlist-widget.s3.us-east-2.amazonaws.com/getwaitlist.min.js"
        strategy="afterInteractive"
      />
    </div>
  );
}
