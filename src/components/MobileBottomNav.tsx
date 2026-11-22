import { Home, Laptop, MessageSquare, Settings } from "lucide-react";

import type { NavRoute } from "../types/api";

const MOBILE_TABS: {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "assistant", label: "Assistant", icon: MessageSquare },
  { id: "devices", label: "Devices", icon: Laptop },
  { id: "settings", label: "Settings", icon: Settings },
];

export function MobileBottomNav({
  activeRoute,
  onSelect,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
}) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="flex h-15 shrink-0 items-center justify-around border-t border-white/[0.08] bg-[#0D0F13]/95 px-2 backdrop-blur-md md:hidden"
    >
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeRoute === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium transition ${
              active ? "text-[#F4F1EA]" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
