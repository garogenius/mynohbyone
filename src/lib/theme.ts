export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "nohbyone.theme";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  const val = localStorage.getItem(STORAGE_KEY);
  if (val === "light" || val === "dark" || val === "system") return val;
  return "dark";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("light", resolved === "light");
  }
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, pref);
  }
  return resolved;
}
