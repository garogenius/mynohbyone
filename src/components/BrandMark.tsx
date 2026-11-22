import { useEffect, useState } from "react";

import { getStoredTheme, resolveTheme, type ResolvedTheme } from "../lib/theme";

interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "logo";
  forceDark?: boolean;
}

export function BrandMark({
  size = "md",
  variant = "icon",
  forceDark = false,
}: BrandMarkProps) {
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme())
  );

  useEffect(() => {
    const onThemeChange = () => setResolved(resolveTheme(getStoredTheme()));
    window.addEventListener("nohby-theme-change", onThemeChange);
    return () => window.removeEventListener("nohby-theme-change", onThemeChange);
  }, []);

  const isDark = forceDark || resolved === "dark";

  if (variant === "logo") {
    const heightClass = isDark
      ? size === "sm"
        ? "h-6"
        : size === "lg"
          ? "h-9"
          : "h-7"
      : size === "sm"
        ? "h-8"
        : size === "lg"
          ? "h-12"
          : "h-10";
    return (
      <img
        src={isDark ? "/logo-white.png" : "/logo-black.png"}
        alt="NohbyOne"
        className={`${heightClass} w-auto select-none object-contain`}
      />
    );
  }

  const dims =
    size === "sm"
      ? "h-8 w-8 rounded-lg"
      : size === "lg"
      ? "h-12 w-12 rounded-2xl"
      : "h-9 w-9 rounded-xl";

  return (
    <img
      src={isDark ? "/icon-black.png" : "/icon-white.png"}
      alt="NohbyOne"
      className={`${dims} shrink-0 select-none object-cover ring-1 ${
        isDark ? "ring-white/15" : "ring-black/10"
      }`}
    />
  );
}
