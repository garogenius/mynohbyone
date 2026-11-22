import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

type AuthMode = "login" | "register" | "forgot";

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

export function AuthScreen() {
  const { login, register, busy, error, clearError, showToast } = useAppStore();

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [submittingForgot, setSubmittingForgot] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % EDITORIAL_SLIDES.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalMsg(null);
    clearError();
  };

  const passwordChecks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Lowercase", ok: /[a-z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);

    if (mode === "login") {
      try {
        await login(email.trim(), password);
      } catch {
        // Error surfaced in store
      }
      return;
    }

    if (mode === "register") {
      try {
        await register(name.trim(), email.trim(), password);
      } catch {
        // Error surfaced in store
      }
      return;
    }

    setSubmittingForgot(true);
    try {
      const res = await apiClient.forgotPassword(email.trim());
      setLocalMsg(res.message);
      showToast("info", "Password reset request accepted.");
    } catch (err) {
      setLocalMsg(err instanceof ApiError ? err.message : "Unable to process request.");
    } finally {
      setSubmittingForgot(false);
    }
  };

  const currentSlide = EDITORIAL_SLIDES[slideIndex];

  return (
    <div className="grid min-h-screen w-full bg-[#0B0C0E] lg:grid-cols-12">
      {/* Left: Full-bleed architectural studio showcase (Desktop lg+) */}
      <section className="relative hidden overflow-hidden border-r border-white/[0.08] bg-[#090A0C] lg:col-span-6 lg:flex lg:flex-col lg:justify-between xl:col-span-7">
        {/* Bespoke studio visual with slow cinematic Ken Burns drift */}
        <motion.img
          src="/nohby-studio.jpg"
          alt="Nohby ONE architectural glass and brushed titanium sculpture"
          initial={{ scale: 1.02 }}
          animate={{ scale: [1.02, 1.09, 1.02] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-85"
        />

        {/* Editorial dark vignette for crisp legibility */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-[#0B0C0E]/35 to-[#0B0C0E]/65" />

        {/* Top bar */}
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

        {/* Bottom editorial statement with smooth Framer Motion crossfade */}
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

          {/* Minimalist slide indicators */}
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

      {/* Right: Distraction-free crafted Auth Studio (Desktop, Tablet & Mobile) */}
      <section className="flex min-h-screen flex-col justify-between lg:col-span-6 xl:col-span-5">
        {/* Mobile & Tablet compact studio banner */}
        <div className="relative h-36 w-full overflow-hidden border-b border-white/[0.08] sm:h-44 lg:hidden">
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
            <span className="font-mono text-[10px] tracking-widest text-[#D6C6A5] uppercase">
              Local-First AI OS
            </span>
          </div>
        </div>

        {/* Centered form container */}
        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-10 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px]"
          >
            {/* Sliding segmented tab switch */}
            {mode !== "forgot" && (
              <div className="relative mb-8 grid grid-cols-2 rounded-xl border border-white/[0.08] bg-[#121418] p-1">
                {(["login", "register"] as const).map((tab) => {
                  const active = mode === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => switchMode(tab)}
                      className={`relative z-10 min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                        active ? "text-[#0B0C0E]" : "text-[#A1A3AA] hover:text-[#F4F1EA]"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="auth-active-tab"
                          transition={{ type: "spring", stiffness: 420, damping: 32 }}
                          className="absolute inset-0 -z-10 rounded-lg bg-[#F4F1EA]"
                        />
                      )}
                      {tab === "login" ? "Sign In" : "Create Account"}
                    </button>
                  );
                })}
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F4F1EA]">
                  {mode === "login"
                    ? "Welcome back"
                    : mode === "register"
                    ? "Create your account"
                    : "Reset your password"}
                </h1>
                <p className="mt-1.5 text-sm text-[#8E9199]">
                  {mode === "login"
                    ? "Sign in to connect this device to your Nohby ONE workspace."
                    : mode === "register"
                    ? "Set up your personal operating assistant in seconds."
                    : "Enter your account email and we will send recovery instructions."}
                </p>
              </motion.div>
            </AnimatePresence>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200"
              >
                {error}
              </motion.div>
            )}

            {localMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-xl border border-[#D6C6A5]/30 bg-[#D6C6A5]/10 px-4 py-3 text-xs leading-relaxed text-[#F4F1EA]"
              >
                {localMsg}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === "register" && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
                  >
                    Full name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
                >
                  Work or personal email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
                />
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="auth-password"
                      className="text-xs font-medium text-[#C8C9CE]"
                    >
                      Password
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-xs font-medium text-[#A1A3AA] transition hover:text-[#F4F1EA]"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={mode === "register" ? 8 : 1}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {mode === "register" && (
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      {passwordChecks.map((rule) => (
                        <div
                          key={rule.label}
                          className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                            rule.ok ? "text-emerald-400" : "text-[#6E717A]"
                          }`}
                        >
                          <Check className="h-3 w-3 shrink-0" />
                          <span>{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || submittingForgot}
                className="btn-ivory mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm"
              >
                {(busy || submittingForgot) && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {mode === "login"
                    ? "Sign In"
                    : mode === "register"
                    ? "Create Account"
                    : "Send Recovery Link"}
                </span>
                {!busy && !submittingForgot && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mt-5 text-xs font-medium text-[#A1A3AA] transition hover:text-[#F4F1EA]"
              >
                ← Return to Sign In
              </button>
            )}
          </motion.div>
        </div>

        {/* Subtle legal/security footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4 text-[11px] text-[#6E717A] sm:px-10">
          <span>© {new Date().getFullYear()} Nohby Technologies Limited</span>
          <span>Encrypted sessions · Local execution</span>
        </footer>
      </section>
    </div>
  );
}
