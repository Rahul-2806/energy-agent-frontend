import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EnergyAgent — Rahul R",
  description: "Autonomous Energy Trading Intelligence — ENTSO-E Real Prices | Groq AI",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
