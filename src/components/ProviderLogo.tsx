export function ProviderLogo({
  provider,
  className = "h-8 w-8",
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case "gmail":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <path fill="#EA4335" d="M12 16v18h5V22.5L24 28l7-5.5V34h5V16l-12 9z" />
          <path fill="#4285F4" d="M12 16l5 4v14h-5z" />
          <path fill="#34A853" d="M36 16l-5 4v14h5z" />
          <path fill="#FBBC05" d="M36 16c0-1.6-1.9-2.5-3.2-1.5L24 21.5l-8.8-7C13.9 13.5 12 14.4 12 16l12 9 12-9z" />
        </svg>
      );
    case "outlook":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#0078D4" />
          <rect x="20" y="13" width="18" height="22" rx="2.5" fill="#28A8EA" />
          <path fill="#14447D" d="M20 18l9 6 9-6v3l-9 6-9-6z" />
          <rect x="10" y="15" width="16" height="18" rx="2.5" fill="#0358A7" />
          <circle cx="18" cy="24" r="4.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
        </svg>
      );
    case "zoom":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#2D8CFF" />
          <rect x="11" y="17" width="18" height="14" rx="3.5" fill="#FFFFFF" />
          <path fill="#FFFFFF" d="M31 21l6-4v14l-6-4z" />
        </svg>
      );
    case "google_meet":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <path fill="#00832D" d="M29 20l7-5.5v19L29 28z" />
          <path fill="#0066DA" d="M11 26v6c0 1.7 1.3 3 3 3h6v-9h-9z" />
          <path fill="#E94235" d="M11 20v6h9v-9h-6c-1.7 0-3 1.3-3 3z" />
          <path fill="#FFBA00" d="M20 17h9v9h-9z" />
          <path fill="#00AC47" d="M20 26h9v9h-9z" />
        </svg>
      );
    case "microsoft_teams":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#5059C9" />
          <circle cx="32" cy="17" r="4" fill="#7B83EB" />
          <path fill="#7B83EB" d="M26 23h10a2 2 0 0 1 2 2v7a5 5 0 0 1-5 5h-3a4 4 0 0 1-4-4V23z" />
          <rect x="10" y="16" width="17" height="17" rx="3" fill="#3B42A3" />
          <path fill="#FFFFFF" d="M14 21h9v2.2h-3.3V30h-2.4v-6.8H14z" />
        </svg>
      );
    case "x_twitter":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#0B0D12" />
          <path
            fill="#FFFFFF"
            d="M26.5 22.3L35.4 12h-2.1l-7.7 8.9L19.4 12h-7.2l9.4 13.6L12.2 36h2.1l8.2-9.5L29 36h7.2l-9.7-13.7zm-2.9 3.4l-.95-1.36L15.1 13.6h3.25l6.1 8.7.95 1.36 7.9 11.3H30l-6.4-9.26z"
          />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#0A66C2" />
          <rect x="13" y="20" width="4.5" height="14" rx="0.8" fill="#FFFFFF" />
          <circle cx="15.25" cy="15.25" r="2.6" fill="#FFFFFF" />
          <path
            fill="#FFFFFF"
            d="M21 20h4.3v2c.9-1.4 2.5-2.3 4.6-2.3 4 0 5.6 2.5 5.6 6.2V34H31v-7.1c0-1.9-.7-3.2-2.5-3.2-1.7 0-2.7 1.2-3 2.3-.1.4-.1.9-.1 1.4V34H21V20z"
          />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FD5949" />
              <stop offset="50%" stopColor="#D6249F" />
              <stop offset="100%" stopColor="#285AEB" />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#ig-grad)" />
          <rect x="13" y="13" width="22" height="22" rx="6" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
          <circle cx="24" cy="24" r="5.2" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
          <circle cx="30.5" cy="17.5" r="1.5" fill="#FFFFFF" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#1877F2" />
          <path
            fill="#FFFFFF"
            d="M27.3 36V25.5h3.5l.6-4.1h-4.1v-2.6c0-1.2.3-2 2.1-2h2.2v-3.7c-.4-.1-1.7-.2-3.2-.2-3.2 0-5.4 1.9-5.4 5.5v3h-3.6v4.1H23V36h4.3z"
          />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FF0000" />
          <path fill="#FFFFFF" d="M20 17.5l11.5 6.5L20 30.5z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#25D366" />
          <path
            fill="#FFFFFF"
            d="M24 12a12 12 0 0 0-10.3 18.1L12 36l6.1-1.6A12 12 0 1 0 24 12zm6.4 16.8c-.3.8-1.6 1.5-2.2 1.6-.6.1-1.3.1-2.1-.1-.5-.2-1.1-.4-1.9-.7-3.4-1.5-5.6-4.9-5.8-5.1-.2-.2-1.4-1.9-1.4-3.6s.9-2.5 1.2-2.8c.3-.3.7-.4.9-.4h.7c.2 0 .5-.1.8.6.3.7 1 2.4 1.1 2.6.1.2.1.4 0 .6-.1.2-.2.4-.4.6l-.5.6c-.2.2-.4.4-.2.8.2.4 1 1.7 2.2 2.7 1.5 1.3 2.8 1.7 3.2 1.9.4.2.6.2.8-.1.2-.3.9-1.1 1.2-1.4.3-.3.5-.3.8-.2.3.1 2.1 1 2.5 1.2.4.2.6.3.7.4.1.2.1 1-.2 1.8z"
          />
        </svg>
      );
    case "google_calendar":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <rect x="11" y="11" width="26" height="26" rx="4" fill="#4285F4" />
          <rect x="15" y="17" width="18" height="16" rx="2" fill="#FFFFFF" />
          <text x="24" y="29" textAnchor="middle" fill="#1A73E8" fontSize="11" fontWeight="700" fontFamily="sans-serif">
            31
          </text>
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#4A154B" />
          <rect x="13" y="21" width="8" height="3.2" rx="1.6" fill="#36C5F0" />
          <rect x="21" y="13" width="3.2" height="8" rx="1.6" fill="#2EB67D" />
          <rect x="27" y="23.8" width="8" height="3.2" rx="1.6" fill="#ECB22E" />
          <rect x="23.8" y="27" width="3.2" height="8" rx="1.6" fill="#E01E5A" />
        </svg>
      );
    case "notion":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <rect x="12" y="12" width="24" height="24" rx="4" fill="none" stroke="#111111" strokeWidth="2.4" />
          <path fill="#111111" d="M18 30V18h2.6l6.8 8.3V18H30v12h-2.5l-6.9-8.4V30H18z" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#161B22" />
          <path
            fill="#FFFFFF"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M24 12a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 24 12z"
          />
        </svg>
      );
    case "google_drive":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <path fill="#0066DA" d="M16.2 32.5l-3.8-6.6 8.2-14.2 3.8 6.6z" />
          <path fill="#00AC47" d="M20.6 11.7h7.6l8.2 14.2h-7.6z" />
          <path fill="#EA4335" d="M36.4 25.9l-3.8 6.6H16.2l3.8-6.6z" />
          <path fill="#FFBA00" d="M24.4 18.3l3.8-6.6 8.2 14.2-3.8 6.6z" opacity="0.85" />
        </svg>
      );
    case "remote_desktop":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#111318" />
          <rect x="9" y="12" width="30" height="24" rx="4" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeDasharray="3 2" />
          <text x="24" y="28" textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="800" fontFamily="sans-serif">
            DC
          </text>
        </svg>
      );
    case "health":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <circle cx="24" cy="15" r="5" fill="#FF2D55" />
          <circle cx="31.8" cy="19.5" r="5" fill="#FF3B30" />
          <circle cx="31.8" cy="28.5" r="5" fill="#FF2D55" />
          <circle cx="24" cy="33" r="5" fill="#FF3B30" />
          <circle cx="16.2" cy="28.5" r="5" fill="#FF2D55" />
          <circle cx="16.2" cy="19.5" r="5" fill="#FF3B30" />
          <path
            fill="#FFFFFF"
            d="M24 29.2l-4.2-4c-1.5-1.4-1.5-3.7 0-5.1 1.3-1.2 3.3-1.1 4.2.2.9-1.3 2.9-1.4 4.2-.2 1.5 1.4 1.5 3.7 0 5.1l-4.2 4z"
          />
        </svg>
      );
    case "supabase":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <path
            fill="#3ECF8E"
            d="M26.6 35.8c-.8 1-2.4.4-2.4-.9V25h10.2c1.4 0 2.2 1.6 1.3 2.7l-9.1 8.1z"
          />
          <path
            fill="#249361"
            d="M21.4 12.2c.8-1 2.4-.4 2.4.9V23H13.6c-1.4 0-2.2-1.6-1.3-2.7l9.1-8.1z"
          />
        </svg>
      );
    case "icloud_mail":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#0A84FF" />
          <rect x="11" y="15" width="26" height="18" rx="3" fill="#FFFFFF" />
          <path fill="none" stroke="#0A84FF" strokeWidth="2.2" d="M12 16.5L24 25.5l12-9" />
        </svg>
      );
    case "icloud_calendar":
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          <rect width="48" height="48" rx="12" fill="#FFFFFF" />
          <text x="24" y="18" textAnchor="middle" fill="#FF3B30" fontSize="8" fontWeight="700" fontFamily="sans-serif">
            Tue
          </text>
          <text x="24" y="34" textAnchor="middle" fill="#111111" fontSize="18" fontWeight="600" fontFamily="sans-serif">
            1
          </text>
        </svg>
      );
    default:
      return (
        <div
          className={`flex items-center justify-center rounded-xl bg-[#0066FF]/20 text-xs font-bold uppercase text-[#00D4FF] ${className}`}
        >
          {provider.slice(0, 2)}
        </div>
      );
  }
}
