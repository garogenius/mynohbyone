import { motion } from "framer-motion";

interface AiCoreOrbProps {
  size?: "sm" | "md" | "lg";
  state?: "idle" | "booting" | "active";
}

/**
 * Living AI core visualization with counter-rotating orbital rings and breathing plasma glow.
 */
export function AiCoreOrb({ size = "md", state = "active" }: AiCoreOrbProps) {
  const outer =
    size === "sm" ? "h-12 w-12" : size === "lg" ? "h-28 w-28" : "h-20 w-20";
  const inner =
    size === "sm" ? "h-6 w-6" : size === "lg" ? "h-14 w-14" : "h-10 w-10";

  const speed = state === "booting" ? 3.2 : state === "active" ? 7 : 12;

  return (
    <div className={`relative flex items-center justify-center ${outer}`} aria-hidden="true">
      {/* Ambient aura */}
      <motion.div
        animate={{ scale: [0.92, 1.12, 0.92], opacity: [0.45, 0.8, 0.45] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/40 via-cyan-400/25 to-violet-500/40 blur-xl"
      />

      {/* Outer orbital ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 rounded-full border border-indigo-400/35 border-t-cyan-300/90 border-r-indigo-400/70"
      />

      {/* Counter-rotating inner telemetry ring */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: speed * 1.4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-2 rounded-full border border-dashed border-cyan-400/35 border-b-indigo-300/80"
      />

      {/* Fluid plasma core */}
      <motion.div
        animate={{
          scale: [0.96, 1.06, 0.96],
          borderRadius: ["46% 54% 52% 48%", "54% 46% 48% 52%", "46% 54% 52% 48%"],
        }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        className={`relative flex items-center justify-center ${inner} bg-gradient-to-br from-indigo-400 via-indigo-600 to-cyan-400 shadow-[0_0_24px_rgba(99,102,241,0.65)] ring-1 ring-white/30`}
      >
        <div className="h-2.5 w-2.5 rounded-full bg-white/90 shadow-[0_0_12px_#ffffff]" />
      </motion.div>
    </div>
  );
}
