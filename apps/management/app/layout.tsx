import { cookies } from "next/headers";
import { ThemeDocument, ThemeSwitch } from "@bazak/ui/components/theme-switch";
import { readTheme, themeCookie } from "@bazak/ui/lib/theme";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./report.css";

export const metadata: Metadata = {
  title: "Evaluation runs · Bazak",
  description: "Review labeled shopping copilot evaluation results.",
};

export default async function Layout({ children }: { children: ReactNode }) {
  const theme = readTheme((await cookies()).get(themeCookie)?.value);

  return (
    <ThemeDocument initialTheme={theme}>
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link href="/" className="wordmark">
            Bazak
          </Link>
          <span className="workspace">Evaluation workspace</span>
          <ThemeSwitch />
        </div>
      </header>
      <main className="shell">{children}</main>
    </ThemeDocument>
  );
}
