export interface OrbStyleOption {
  id: "plasma" | "neural" | "aurora";
  label: string;
  description: string;
  shape: "circle" | "wide";
  gif: string;
  still: string;
}

export const ORB_STYLE_OPTIONS: OrbStyleOption[] = [
  {
    id: "plasma",
    label: "Nohby Plasma",
    description: "Classic cyan & violet energy orb",
    shape: "circle",
    gif: "/vioce-wave.gif",
    still: "/vioce-wave-image.jpg",
  },
  {
    id: "neural",
    label: "Neural Wave",
    description: "Dynamic luminous horizontal wave",
    shape: "wide",
    gif: "/Gemini_Generated_Gif_2jr1kn2jr1kn2jr1.gif",
    still: "/orb-neural-still.jpg",
  },
  {
    id: "aurora",
    label: "Aurora Pulse",
    description: "Fluid multi-spectrum voice wave",
    shape: "wide",
    gif: "/Gemini_Generated_Gif_bqjogvbqjogvbqjo.gif",
    still: "/orb-aurora-still.jpg",
  },
];

const STORAGE_KEY = "nohbyone.orbStyle";

export function getSelectedOrbStyle(): OrbStyleOption {
  if (typeof window === "undefined") return ORB_STYLE_OPTIONS[0];
  const saved = localStorage.getItem(STORAGE_KEY);
  return ORB_STYLE_OPTIONS.find((o) => o.id === saved) || ORB_STYLE_OPTIONS[0];
}

export function setSelectedOrbStyle(id: OrbStyleOption["id"]): OrbStyleOption {
  const match = ORB_STYLE_OPTIONS.find((o) => o.id === id) || ORB_STYLE_OPTIONS[0];
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, match.id);
    window.dispatchEvent(new CustomEvent("nohby-orb-style-change", { detail: match }));
  }
  return match;
}
