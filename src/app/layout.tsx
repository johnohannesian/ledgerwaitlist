import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledger — Waitlist",
  description: "The world's first zero-fee trading card exchange",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          type="text/css"
          href="https://prod-waitlist-widget.s3.us-east-2.amazonaws.com/getwaitlist.min.css"
        />
      </head>
      <body className="min-h-screen overflow-x-hidden font-sans antialiased bg-black text-white">
        {children}
      </body>
    </html>
  );
}
