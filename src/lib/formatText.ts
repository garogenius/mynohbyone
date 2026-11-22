/**
 * Strips raw markdown symbols (**, __, ###, *, `) so AI replies display
 * and speak as clean, natural text without literal asterisks or hash marks.
 */
export function cleanDisplayText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    // Bold / italic markers: **text**, __text__, *text*
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?:;)]|$)/g, "$1$2")
    // Heading hashes: ### Heading -> Heading
    .replace(/^\s*#{1,6}\s+/gm, "")
    // Inline backticks: `code` -> code
    .replace(/`([^`]+)`/g, "$1")
    // Stray leftover double-asterisks
    .replace(/\*\*/g, "")
    .trim();
}
