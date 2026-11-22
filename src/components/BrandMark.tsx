interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
}

export function BrandMark({ size = "md" }: BrandMarkProps) {
  const dims =
    size === "sm"
      ? "h-8 w-8 rounded-lg"
      : size === "lg"
      ? "h-11 w-11 rounded-xl"
      : "h-9 w-9 rounded-lg";

  return (
    <div
      className={`${dims} relative flex items-center justify-center border border-white/15 bg-gradient-to-b from-[#23262E] to-[#121419] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={size === "sm" ? "h-4 w-4" : size === "lg" ? "h-5 w-5" : "h-4 w-4"}
        aria-hidden="true"
      >
        <path
          d="M5.5 17V7l7 10V7M16.5 7v10M16.5 7l2.5 2.5"
          stroke="#F4F1EA"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
