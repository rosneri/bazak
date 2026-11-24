import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./report.css";

export const metadata: Metadata = {
  title: "Evaluation runs · Bazak",
  description: "Review labeled shopping copilot evaluation results.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <header className="topbar">
          <div className="shell topbar-inner">
            <Link href="/" className="wordmark">
              Bazak
            </Link>
            <span className="workspace">Evaluation workspace</span>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
