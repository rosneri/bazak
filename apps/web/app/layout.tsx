import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bazak/ui/globals.css";

export const metadata: Metadata = { title: "Shopping copilot" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="overflow-x-clip">
      <body className="overflow-x-clip">{children}</body>
    </html>
  );
}
