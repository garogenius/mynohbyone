import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { applyTheme, getStoredTheme, resolveTheme, type ResolvedTheme } from "../lib/theme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme())
  );

  useEffect(() => {
    const onThemeChange = () => setResolved(resolveTheme(getStoredTheme()));
    window.addEventListener("nohby-theme-change", onThemeChange);
    return () => window.removeEventListener("nohby-theme-change", onThemeChange);
  }, []);

  const toggle = () => {
    const next: ResolvedTheme = resolved === "dark" ? "light" : "dark";
    applyTheme(next);
    setResolved(next);
    window.dispatchEvent(new Event("nohby-theme-change"));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#131519] text-xs font-medium text-[#C8C9CE] transition hover:border-white/[0.22] hover:text-white ${
        compact ? "h-8 w-8" : "h-9 px-3"
      }`}
    >
      {resolved === "dark" ? (
        <Sun className="h-3.5 w-3.5 text-[#D6C6A5]" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-[#111215]" />
      )}
      {!compact && <span>{resolved === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}
