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

/**
 * Strips any conversational meta-preface like
 * "Suleiman, here is a concise, ready-to-say answer:" or "Here is your answer:"
 * so the teleprompter answer reads directly in the first person.
 */
export function cleanFirstPersonAnswer(raw: string | null | undefined): string {
  const cleaned = cleanDisplayText(raw);
  if (!cleaned) return "";
  return cleaned
    .replace(
      /^(?:[A-Z][a-z]+,\s*)?(?:here\s+is|this\s+is)\s+(?:a|your)\s+[^:]{2,55}:\s*/i,
      ""
    )
    .replace(/^["']|["']$/g, "")
    .trim();
}
