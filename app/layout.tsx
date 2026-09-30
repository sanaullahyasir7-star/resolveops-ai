import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResolveOps AI — Incident Command Center",
  description: "A portfolio prototype that demonstrates a simulated incident-response workflow. Not for production operations.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
