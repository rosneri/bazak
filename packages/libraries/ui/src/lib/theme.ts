export const themeCookie = "bazak-theme";

export function readTheme(value: string | undefined) {
  return value === "light" ? "light" : "dark";
}
