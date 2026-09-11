import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarrierGate | SwiftLabor",
  description: "AI carrier compliance and onboarding review by SwiftLabor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
