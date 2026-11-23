import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@bazak/ui/globals.css";
import "./shop.css";

export const metadata: Metadata = {
  title: "Bazak · Shopping desk",
  description: "Find products and compare catalog prices in a saved conversation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
