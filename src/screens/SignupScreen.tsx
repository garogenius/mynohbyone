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
    <div className="flex min-h-screen flex-col bg-[#0B0C0E] text-[#F4F1EA]">
      {/* Compact top navigation */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5 sm:px-8">
        <BrandMark variant="logo" size="sm" />

        <div className="flex items-center gap-2.5 text-xs">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={onGoToLogin}
            className="rounded-lg border border-white/[0.12] bg-[#131519] px-3 py-1.5 font-medium text-[#F4F1EA] transition hover:border-white/[0.24] hover:bg-[#1A1D23]"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Single-viewport compact centered card (no scrolling on desktop/laptop) */}
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[430px] rounded-2xl border border-white/[0.09] bg-[#131519] p-6 shadow-2xl sm:p-7"
        >
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold tracking-tight text-[#F4F1EA]">
              Create your account
            </h1>
            <p className="mt-1 text-xs text-[#8E9199]">
              Get started with your personal Nohby ONE workspace.
            </p>
          </div>

          {(localError || error) && (
            <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-rose-200">
              {localError || error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
            <div>
              <label
                htmlFor="signup-name"
                className="mb-1 block text-xs font-medium text-[#C8C9CE]"
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
                className="studio-input h-10 w-full rounded-xl px-3.5 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="signup-email"
                className="mb-1 block text-xs font-medium text-[#C8C9CE]"
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
                className="studio-input h-10 w-full rounded-xl px-3.5 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1 block text-xs font-medium text-[#C8C9CE]"
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
                    className="studio-input h-10 w-full rounded-xl pr-9 pl-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#6E717A] transition hover:text-[#F4F1EA]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm"
                  className="mb-1 block text-xs font-medium text-[#C8C9CE]"
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
                  className="studio-input h-10 w-full rounded-xl px-3 text-sm"
                />
              </div>
            </div>

            {/* Compact single-line password strength meter */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1 rounded-full transition-colors duration-200 ${
                      strengthScore >= level
                        ? strengthScore === 4
                          ? "bg-emerald-400"
                          : "bg-[#D6C6A5]"
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
              className="btn-ivory mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Create Account</span>
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-5 border-t border-white/[0.07] pt-4 text-center text-xs text-[#8E9199]">
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

      <footer className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[11px] text-[#6E717A] sm:px-8">
        <span>© {new Date().getFullYear()} Nohby Technologies Limited</span>
        <span>Local-first AI OS</span>
      </footer>
    </div>
  );
}
