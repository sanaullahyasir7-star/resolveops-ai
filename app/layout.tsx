import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResolveOps AI — Incident Command Center",
  description: "An evidence-backed AI operations platform for triage, investigation, guarded actions, and evaluation.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
