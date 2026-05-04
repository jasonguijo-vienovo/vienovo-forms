import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vienovo Forms",
  description: "Internal company forms — submit, track, and approve.",
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
  },
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
