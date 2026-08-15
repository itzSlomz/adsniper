import type { Metadata } from "next";
import "./globals.css";
import "./modernist.css";

export const metadata: Metadata = {
  title: "AdSniper",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
