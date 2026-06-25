"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "pio-theme";

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial = resolveInitialTheme();
    // Preserve the post-hydration theme resolution used by the current dark-mode implementation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const toggle = () => {
    const html = document.documentElement;
    html.classList.add("theme-transitioning");
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      html.dataset.theme = next;
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
    setTimeout(() => html.classList.remove("theme-transitioning"), 350);
  };

  return { theme, toggle };
}
