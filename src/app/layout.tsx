import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Suspense } from "react";
import { SessionGate, SessionGateFallback } from "@/components/auth/session-gate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "S. Prince Management Tool", template: "%s · S. Prince Management Tool" },
  description:
    "Tenders, projects, subcontractors, employees, GST and daily work for S. Prince Hightech Pvt. Ltd.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2b800",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <TooltipProvider>
          <Suspense fallback={<SessionGateFallback />}>
            <SessionGate>{children}</SessionGate>
          </Suspense>
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
