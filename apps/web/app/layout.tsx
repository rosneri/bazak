import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ShopperQueryProvider } from "@/src/client/query-provider";
import "@bazak/ui/globals.css";
import "./shop.css";
import "./chat-stream.css";
import "./turn-diagnostics.css";

export const metadata: Metadata = {
  title: "Bazak · Shopping desk",
  description: "Find products and compare catalog prices in a saved conversation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ShopperQueryProvider>{children}</ShopperQueryProvider>
      </body>
    </html>
  );
}
