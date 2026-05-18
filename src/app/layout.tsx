import type { Metadata } from "next";
import "./globals.css";
import { SystemToast } from "@/components/system-toast";
import { readFlashToast } from "@/lib/flash";

export const metadata: Metadata = {
  title: "Vienovo Forms",
  description: "Internal company forms — submit, track, and approve.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const toast = await readFlashToast();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <SystemToast initialToast={toast} />
        {children}
      </body>
    </html>
  );
}
