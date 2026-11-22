import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppStore } from "../store/useAppStore";

export function SignupScreen({ onGoToLogin }: { onGoToLogin: () => void }) {
  const { register, busy, error, clearError } = useAppStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const strengthScore = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
  ].filter(Boolean).length;

  const strengthLabel =
    !password
      ? ""
      : strengthScore <= 1
      ? "Weak"
      : strengthScore === 2
      ? "Fair"
      : strengthScore === 3
      ? "Good"
      : "Strong";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    try {
      await register(name.trim(), email.trim(), password);
    } catch {
      // Handled in store
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#08142E]">
      {/* Full-bleed looping HD background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/nohby-studio-2.jpg"
        className="pointer-events-none fixed inset-0 h-full w-full object-cover object-center opacity-80"
      >
        <source src="/signup-video.mp4" type="video/mp4" />
      </video>

      {/* NohbyOne Cobalt Blue & Deep Navy atmospheric color overlay */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-tr from-[#08142E]/90 via-[#003E9E]/45 to-[#08142E]/85" />
      <div className="pointer-events-none fixed inset-0 bg-[#08142E]/30 backdrop-blur-[2px]" />

      {/* Compact top navigation over video */}
      <header className="editorial-dark-panel relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5 sm:px-8">
        <BrandMark variant="logo" size="sm" forceDark />

        <div className="flex items-center gap-2.5 text-xs">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={onGoToLogin}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 font-medium text-white backdrop-blur-md transition hover:bg-white/20"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Single-viewport compact centered card (no scrolling on desktop/laptop) */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-4">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[375px] rounded-xl border border-white/[0.12] bg-[#131519] p-5 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-6"
        >
          <div className="text-center">
            <h1 className="font-display text-lg font-semibold tracking-tight text-[#F4F1EA]">
              Create your account
            </h1>
            <p className="mt-1 text-xs text-[#8E9199]">
              Get started with your personal Nohby ONE workspace.
            </p>
          </div>

          {(localError || error) && (
            <div className="mt-3.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
              {localError || error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="signup-name"
                className="mb-1 block text-[11px] font-medium text-[#C8C9CE]"
              >
                Full name
              </label>
              <input
                id="signup-name"
                type="text"
                required
                minLength={2}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="studio-input h-9 w-full rounded-lg px-3 text-[13px]"
              />
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="mb-1 block text-[11px] font-medium text-[#C8C9CE]"
              >
                Email address
              </label>
              <input
                id="signup-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@company.com"
                className="studio-input h-9 w-full rounded-lg px-3 text-[13px]"
              />
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1 block text-[11px] font-medium text-[#C8C9CE]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 chars"
                    className="studio-input h-9 w-full rounded-lg pr-8 pl-3 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#6E717A] transition hover:text-[#F4F1EA]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm"
                  className="mb-1 block text-[11px] font-medium text-[#C8C9CE]"
                >
                  Confirm password
                </label>
                <input
                  id="signup-confirm"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter"
                  className="studio-input h-9 w-full rounded-lg px-3 text-[13px]"
                />
              </div>
            </div>

            {/* Compact single-line password strength meter */}
            <div className="space-y-1">
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1 rounded-full transition-colors duration-200 ${
                      strengthScore >= level
                        ? strengthScore === 4
                          ? "bg-emerald-400"
                          : "bg-[#0066FF]"
                        : "bg-white/[0.08]"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#6E717A]">
                <span>8+ chars, uppercase, lowercase &amp; number</span>
                {strengthLabel && (
                  <span
                    className={
                      strengthScore === 4 ? "font-medium text-emerald-400" : "text-[#A1A3AA]"
                    }
                  >
                    {strengthLabel}
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-ivory mt-1 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Create Account</span>
              {!busy && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </form>

          <p className="mt-4 border-t border-white/[0.07] pt-3.5 text-center text-xs text-[#8E9199]">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onGoToLogin}
              className="font-medium text-[#F4F1EA] underline-offset-4 transition hover:underline"
            >
              Sign in
            </button>
          </p>
        </motion.div>
      </main>

      <footer className="editorial-dark-panel relative z-10 flex shrink-0 items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] text-white/70 sm:px-8">
        <span>© {new Date().getFullYear()} Nohby Technologies Limited</span>
        <span>Local-first AI OS</span>
      </footer>
    </div>
  );
}
