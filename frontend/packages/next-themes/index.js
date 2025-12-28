import { useEffect } from "react";

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  forcedTheme
}) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const theme = forcedTheme || defaultTheme;
    const root = document.documentElement;

    if (attribute === "class") {
      root.classList.remove("light", "dark");
      if (theme) {
        root.classList.add(theme);
      }
      return;
    }

    root.setAttribute(attribute, theme);
  }, [attribute, defaultTheme, forcedTheme]);

  return children;
}
