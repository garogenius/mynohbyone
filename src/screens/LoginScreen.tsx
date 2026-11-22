import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppStore } from "../store/useAppStore";

const EDITORIAL_SLIDES = [
  {
    eyebrow: "LOCAL-FIRST ARCHITECTURE",
    headline: "Intelligence in the cloud. Control on your machine.",
    body: "Nohby ONE plans and reasons with precision, while every desktop action runs locally under your explicit authority.",
  },
  {
    eyebrow: "SCOPED APPROVAL ENGINE",
    headline: "Nothing sensitive executes without your sign-off.",
    body: "Review exact parameters, recipients, and risk levels before an email is sent, a file is modified, or a post goes live.",
  },
  {
    eyebrow: "TRANSPARENT VOICE & AGENTS",
    headline: "Natural voice control with zero covert activity.",
    body: "Configurable wake words, visible microphone telemetry, and instant per-device session revocation built into the core.",
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
    }, 6500);
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
      {/* Left: Full-bleed architectural studio showcase (Desktop lg+) */}
      <section className="editorial-dark-panel relative hidden overflow-hidden border-r border-white/[0.08] bg-[#090A0C] lg:col-span-6 lg:flex lg:flex-col lg:justify-between xl:col-span-7">
        <motion.img
          src="/nohby-studio.jpg"
          alt="Nohby ONE architectural glass and brushed titanium sculpture"
          initial={{ scale: 1.02 }}
          animate={{ scale: [1.02, 1.09, 1.02] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-85"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-[#0B0C0E]/35 to-[#0B0C0E]/65" />

        <div className="relative z-10 flex items-center justify-between p-8 xl:p-10">
          <div className="flex items-center gap-3">
            <BrandMark size="md" />
            <div>
              <span className="font-display text-sm font-semibold tracking-tight text-[#F4F1EA]">
                Nohby ONE
              </span>
              <span className="ml-2 font-mono text-[11px] text-[#A1A3AA]">v0.3</span>
            </div>
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
        <div className="editorial-dark-panel relative h-36 w-full overflow-hidden border-b border-white/[0.08] sm:h-44 lg:hidden">
          <img
            src="/nohby-studio.jpg"
            alt=""
            className="h-full w-full object-cover object-center opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-[#0B0C0E]/45 to-transparent" />
          <div className="absolute right-5 bottom-4 left-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <BrandMark size="sm" />
              <span className="font-display text-sm font-semibold text-[#F4F1EA]">
                Nohby ONE
              </span>
            </div>
            <ThemeToggle compact />
          </div>
        </div>

        <div className="hidden items-center justify-end px-8 pt-6 lg:flex">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-10 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[390px]"
          >
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F1EA]">
              Sign in to Nohby ONE
            </h1>
            <p className="mt-1.5 text-sm text-[#8E9199]">
              Enter your credentials to access your workspace.
            </p>

            {error && (
              <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
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
                  className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="text-xs font-medium text-[#C8C9CE]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={onGoToForgot}
                    className="text-xs font-medium text-[#A1A3AA] transition hover:text-[#F4F1EA]"
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
                    className="studio-input h-11 w-full rounded-xl pr-11 pl-3.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#6E717A] transition hover:text-[#F4F1EA]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-ivory mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Sign In</span>
                {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-7 border-t border-white/[0.07] pt-5 text-center text-xs text-[#8E9199]">
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
