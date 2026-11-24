import { cookies } from "next/headers";
import { ThemeDocument } from "@bazak/ui/components/theme-switch";
import { readTheme, themeCookie } from "@bazak/ui/lib/theme";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = readTheme((await cookies()).get(themeCookie)?.value);

  return (
    <ThemeDocument initialTheme={theme}>
      <ShopperQueryProvider>{children}</ShopperQueryProvider>
    </ThemeDocument>
  );
}
