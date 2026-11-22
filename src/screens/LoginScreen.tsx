import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppStore } from "../store/useAppStore";

const EDITORIAL_SLIDES = [
  {
    image: "/nohby-studio.jpg",
    alt: "Nohby ONE architectural glass and brushed titanium sculpture",
    eyebrow: "LOCAL-FIRST ARCHITECTURE",
    headline: "Intelligence in the cloud. Control on your machine.",
    body: "Nohby ONE plans and reasons with precision, while every desktop action runs locally under your explicit authority.",
    panX: ["-2%", "2%"],
    panY: ["-1%", "1.5%"],
  },
  {
    image: "/nohby-studio-2.jpg",
    alt: "Precision interlocking sapphire and titanium rings",
    eyebrow: "SCOPED APPROVAL ENGINE",
    headline: "Nothing sensitive executes without your sign-off.",
    body: "Review exact parameters, recipients, and risk levels before an email is sent, a file is modified, or a post goes live.",
    panX: ["2%", "-2%"],
    panY: ["1.5%", "-1.5%"],
  },
  {
    image: "/nohby-studio-3.jpg",
    alt: "Frosted obsidian acoustic soundwave glass ribbons",
    eyebrow: "TRANSPARENT VOICE & AGENTS",
    headline: "Natural voice control with zero covert activity.",
    body: "Configurable wake words, visible microphone telemetry, and instant per-device session revocation built into the core.",
    panX: ["-1.5%", "1.5%"],
    panY: ["2%", "-1%"],
  },
];

export function LoginScreen({
  onGoToSignup,
  onGoToForgot,
}: {
  onGoToSignup: () => void;
  onGoToForgot: () => void;
}) {
  const { login, busy, error, clearError } = useAppStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % EDITORIAL_SLIDES.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email.trim(), password);
    } catch {
      // Error surfaced in store
    }
  };

  const currentSlide = EDITORIAL_SLIDES[slideIndex];

  return (
    <div className="grid min-h-screen w-full bg-[#0B0C0E] lg:grid-cols-12">
      {/* Left: Full-bleed sliding architectural studio showcase (Desktop lg+) */}
      <section className="editorial-dark-panel relative hidden overflow-hidden border-r border-white/[0.08] bg-[#08142E] lg:col-span-6 lg:flex lg:flex-col lg:justify-between xl:col-span-7">
        <AnimatePresence mode="sync">
          <motion.img
            key={currentSlide.image}
            src={currentSlide.image}
            alt={currentSlide.alt}
            initial={{ opacity: 0, scale: 1.12, x: currentSlide.panX[0], y: currentSlide.panY[0] }}
            animate={{
              opacity: 0.9,
              scale: 1.03,
              x: currentSlide.panX[1],
              y: currentSlide.panY[1],
            }}
            exit={{ opacity: 0, scale: 1.0, transition: { duration: 0.9, ease: "easeInOut" } }}
            transition={{
              opacity: { duration: 0.9, ease: "easeInOut" },
              scale: { duration: 6.5, ease: "linear" },
              x: { duration: 6.5, ease: "linear" },
              y: { duration: 6.5, ease: "linear" },
            }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center will-change-transform"
          />
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#08142E]/95 via-[#0046B8]/45 to-[#08142E]/80 mix-blend-multiply" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08142E]/95 via-[#08142E]/35 to-[#0066FF]/20" />

        <div className="relative z-10 flex items-center justify-between p-8 xl:p-10">
          <div className="flex items-center gap-3">
            <BrandMark variant="logo" size="md" forceDark />
          </div>
          <span className="font-mono text-[11px] tracking-widest text-[#D6C6A5]/80 uppercase">
            Nohby Technologies
          </span>
        </div>

        <div className="relative z-10 max-w-xl p-8 xl:p-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="font-mono text-[11px] tracking-[0.18em] text-[#D6C6A5] uppercase">
                {currentSlide.eyebrow}
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold leading-[1.18] tracking-tight text-[#F4F1EA] xl:text-4xl">
                {currentSlide.headline}
              </h2>
              <p className="mt-3.5 text-sm leading-relaxed text-[#B2B4BC]">
                {currentSlide.body}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center gap-2">
            {EDITORIAL_SLIDES.map((s, idx) => (
              <button
                key={s.eyebrow}
                type="button"
                onClick={() => setSlideIndex(idx)}
                aria-label={`Show highlight ${idx + 1}`}
                className={`h-1 rounded-full transition-all duration-300 ${
                  idx === slideIndex
                    ? "w-8 bg-[#F4F1EA]"
                    : "w-2 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Right: Distraction-free Sign In form */}
      <section className="flex min-h-screen flex-col justify-between lg:col-span-6 xl:col-span-5">
        <div className="editorial-dark-panel relative h-36 w-full overflow-hidden border-b border-white/[0.08] bg-[#08142E] sm:h-44 lg:hidden">
          <AnimatePresence mode="sync">
            <motion.img
              key={currentSlide.image}
              src={currentSlide.image}
              alt=""
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 0.85, scale: 1.02 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.8 }, scale: { duration: 6, ease: "linear" } }}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-[#08142E]/95 via-[#0046B8]/45 to-[#0066FF]/20" />
          <div className="absolute right-5 bottom-4 left-5 flex items-center justify-between">
            <BrandMark variant="logo" size="sm" forceDark />
            <ThemeToggle compact />
          </div>
        </div>

        <div className="hidden items-center justify-end px-8 pt-6 lg:flex">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-6 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[340px]"
          >
            <h1 className="font-display text-xl font-semibold tracking-tight text-[#F4F1EA]">
              Sign in to Nohby ONE
            </h1>
            <p className="mt-1 text-xs text-[#8E9199]">
              Enter your credentials to access your workspace.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1 block text-[11px] font-medium text-[#C8C9CE]"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="studio-input h-9 w-full rounded-lg px-3 text-[13px]"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="text-[11px] font-medium text-[#C8C9CE]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={onGoToForgot}
                    className="text-[11px] font-medium text-[#A1A3AA] transition hover:text-[#F4F1EA]"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="studio-input h-9 w-full rounded-lg pr-9 pl-3 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#6E717A] transition hover:text-[#F4F1EA]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-ivory mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Sign In</span>
                {!busy && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </form>

            <div className="mt-5 border-t border-white/[0.07] pt-4 text-center text-xs text-[#8E9199]">
              New to Nohby ONE?{" "}
              <button
                type="button"
                onClick={onGoToSignup}
                className="font-medium text-[#F4F1EA] underline-offset-4 transition hover:underline"
              >
                Create an account
              </button>
            </div>
          </motion.div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4 text-[11px] text-[#6E717A] sm:px-10">
          <span>© {new Date().getFullYear()} Nohby Technologies Limited</span>
          <span>Encrypted sessions · Local execution</span>
        </footer>
      </section>
    </div>
  );
}
