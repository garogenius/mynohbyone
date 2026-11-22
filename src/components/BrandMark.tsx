interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
}

export function BrandMark({ size = "md" }: BrandMarkProps) {
  const dims =
    size === "sm" ? "h-8 w-8 rounded-lg" : size === "lg" ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl";

  return (
    <div
      className={`${dims} relative flex items-center justify-center bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 shadow-lg shadow-indigo-500/25 ring-1 ring-white/15`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5"}
        aria-hidden="true"
      >
        <path
          d="M5 17V7l7 10V7M16.5 7v10M16.5 7l2.5 2.5"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
