import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppStore } from "../store/useAppStore";

const ONBOARDING_STEPS = [
  {
    num: "01",
    title: "Create your account",
    desc: "Establish your encrypted Nohby ONE identity with rotating session tokens.",
    active: true,
  },
  {
    num: "02",
    title: "Bind your desktop machine",
    desc: "Register your computer as an authorised local execution agent.",
    active: false,
  },
  {
    num: "03",
    title: "Control every permission",
    desc: "Configure voice, wake-word, and approval policies on your terms.",
    active: false,
  },
];

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

  const rules = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Lowercase letter", ok: /[a-z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
  ];
  const strengthScore = rules.filter((r) => r.ok).length;

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
      {/* Distinct top editorial navigation bar */}
      <header className="flex h-16 items-center justify-between border-b border-white/[0.07] px-5 sm:px-8 lg:px-12">
        <BrandMark variant="logo" size="md" />

        <div className="flex items-center gap-2.5 text-xs">
          <ThemeToggle compact />
          <span className="hidden text-[#8E9199] sm:inline">Already have an account?</span>
          <button
            type="button"
            onClick={onGoToLogin}
            className="rounded-lg border border-white/[0.12] bg-[#131519] px-3.5 py-2 font-medium text-[#F4F1EA] transition hover:border-white/[0.24] hover:bg-[#1A1D23]"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Distinct centered 2-column Swiss editorial onboarding layout */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-10 sm:px-8 lg:py-14">
        <div className="grid w-full items-start gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Left column: Typographic onboarding journey */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-5 lg:pt-4"
          >
            <p className="font-mono text-[11px] tracking-[0.18em] text-[#D6C6A5] uppercase">
              Get Started · Step 01 of 03
            </p>
            <h1 className="font-display mt-3 text-3xl font-semibold leading-[1.15] tracking-tight text-[#F4F1EA] sm:text-4xl">
              Your personal AI operating layer.
            </h1>
            <p className="mt-3.5 text-sm leading-relaxed text-[#9A9CA4]">
              Designed for professionals who want real automation without surrendering control of
              their machine or private accounts.
            </p>

            {/* Numbered 3-step roadmap (hidden on tiny mobile, visible sm+) */}
            <ol className="mt-8 hidden space-y-5 border-t border-white/[0.08] pt-7 sm:block">
              {ONBOARDING_STEPS.map((step) => (
                <li key={step.num} className="flex items-start gap-4">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-medium ${
                      step.active
                        ? "border-[#F4F1EA] bg-[#F4F1EA] text-[#0B0C0E]"
                        : "border-white/[0.12] text-[#6E717A]"
                    }`}
                  >
                    {step.num}
                  </span>
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        step.active ? "text-[#F4F1EA]" : "text-[#8E9199]"
                      }`}
                    >
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#6E717A]">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 hidden items-center gap-2.5 text-xs text-[#7D8089] lg:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Zero covert recording · Instant per-device revocation</span>
            </div>
          </motion.div>

          {/* Right column: Elevated architectural signup card */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-white/[0.09] bg-[#131519] p-6 shadow-2xl sm:p-8 lg:col-span-7"
          >
            <h2 className="font-display text-lg font-semibold text-[#F4F1EA]">
              Create your Nohby ONE account
            </h2>
            <p className="mt-1 text-xs text-[#8E9199]">
              All fields are required. You will register your device on the next step.
            </p>

            {(localError || error) && (
              <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
                {localError || error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="signup-name"
                    className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
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
                    className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signup-email"
                    className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
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
                    className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
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
                    placeholder="Create a strong password"
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

                {/* Segmented visual password strength bar */}
                <div className="mt-2.5 grid grid-cols-4 gap-1.5">
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

                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {rules.map((rule) => (
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
              </div>

              <div>
                <label
                  htmlFor="signup-confirm"
                  className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
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
                  placeholder="Re-enter your password"
                  className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-ivory mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Create Account &amp; Continue</span>
                {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </motion.div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-4 text-[11px] text-[#6E717A] sm:px-8 lg:px-12">
        <span>© {new Date().getFullYear()} Nohby Technologies Limited</span>
        <span>Privacy-first personal operating assistant</span>
      </footer>
    </div>
  );
}
