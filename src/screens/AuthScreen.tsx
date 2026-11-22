import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { LoginScreen } from "./LoginScreen";
import { SignupScreen } from "./SignupScreen";

type AuthPage = "login" | "signup" | "forgot";

function pageFromPathname(pathname: string): AuthPage {
  if (pathname.startsWith("/signup") || pathname.startsWith("/register")) return "signup";
  if (pathname.startsWith("/forgot")) return "forgot";
  return "login";
}

function pathForPage(page: AuthPage): string {
  if (page === "signup") return "/signup";
  if (page === "forgot") return "/forgot-password";
  return "/login";
}

function ForgotPasswordScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const { showToast } = useAppStore();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await apiClient.forgotPassword(email.trim());
      setMessage(res.message);
      showToast("info", "Recovery request submitted.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Unable to process request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0C0E] px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] rounded-2xl border border-white/[0.09] bg-[#131519] p-6 shadow-2xl sm:p-8"
      >
        <BrandMark size="md" />
        <h1 className="font-display mt-5 text-xl font-semibold text-[#F4F1EA]">
          Reset your password
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[#8E9199]">
          Enter your Nohby ONE account email and we will queue password recovery instructions.
        </p>

        {message && (
          <div className="mt-4 rounded-xl border border-[#D6C6A5]/30 bg-[#D6C6A5]/10 px-4 py-3 text-xs text-[#F4F1EA]">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="forgot-email"
              className="mb-1.5 block text-xs font-medium text-[#C8C9CE]"
            >
              Account email
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-ivory flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Send Recovery Link</span>
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <button
          type="button"
          onClick={onBackToLogin}
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-[#A1A3AA] transition hover:text-[#F4F1EA]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sign In
        </button>
      </motion.div>
    </div>
  );
}

export function AuthScreen() {
  const [page, setPage] = useState<AuthPage>(() =>
    typeof window !== "undefined" ? pageFromPathname(window.location.pathname) : "login"
  );

  const navigate = (next: AuthPage) => {
    setPage(next);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", pathForPage(next));
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setPage(pageFromPathname(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={page}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {page === "login" && (
          <LoginScreen
            onGoToSignup={() => navigate("signup")}
            onGoToForgot={() => navigate("forgot")}
          />
        )}
        {page === "signup" && <SignupScreen onGoToLogin={() => navigate("login")} />}
        {page === "forgot" && <ForgotPasswordScreen onBackToLogin={() => navigate("login")} />}
      </motion.div>
    </AnimatePresence>
  );
}
