"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "./button";
import { themeCookie } from "../lib/theme";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function ThemeDocument({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);

  const preference = useMemo(
    () => ({
      theme,
      toggleTheme() {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        document.cookie = themeCookie + "=" + next + "; Path=/; Max-Age=31536000; SameSite=Lax";
      },
    }),
    [theme],
  );

  return (
    <html lang="en" className="overflow-x-clip" data-theme={theme}>
      <body className="overflow-x-clip">
        <ThemeContext.Provider value={preference}>{children}</ThemeContext.Provider>
      </body>
    </html>
  );
}

export function ThemeSwitch() {
  const preference = useContext(ThemeContext);

  if (!preference) throw new Error("ThemeSwitch requires ThemeDocument.");

  const dark = preference.theme === "dark";

  return (
    <Button
      variant="ghost"
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={preference.toggleTheme}
      className="theme-switch ms-auto min-h-11 min-w-11"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <g>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </g>
        ) : (
          <path d="M20.5 14.1A8.7 8.7 0 0 1 9.9 3.5a8.8 8.8 0 1 0 10.6 10.6Z" />
        )}
      </svg>
    </Button>
  );
}
