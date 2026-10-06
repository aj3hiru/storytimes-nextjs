/** Emoji flag for an ISO 3166-1 alpha-2 code ("IN" → 🇮🇳); empty for anything else. */
export function flagEmoji(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
