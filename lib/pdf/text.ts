/**
 * Make text safe to draw with pdf-lib's standard fonts.
 *
 * The standard 14 PDF fonts (Helvetica et al.) encode WinAnsi only. Handing
 * them a character outside that set — Cyrillic, Greek, CJK, emoji, some
 * punctuation — makes pdf-lib THROW:
 *
 *     WinAnsi cannot encode "Д" (0x0414)
 *
 * Verified in production before this existed: a signer named "Дмитрий Иванов"
 * got HTTP 500 from the public signing endpoint and could never sign, while
 * the identical request with a Latin name succeeded. The same crash hit any
 * document containing a non-Latin field value.
 *
 * Strategy, in order:
 *   1. Compatibility-decompose and strip combining marks, which correctly
 *      renders the common case — "José Ñuñez" → "Jose Nunez" only if needed;
 *      WinAnsi already covers Latin-1, so accented names pass through intact.
 *   2. Map the typographic characters our own UI emits (curly quotes, dashes,
 *      ellipsis) to their ASCII equivalents.
 *   3. Replace anything still unencodable with "?" so rendering NEVER throws.
 *
 * The exact text the user typed is always preserved in the database and in
 * the signature audit trail — this only affects what can be drawn onto the
 * page.
 */

/** WinAnsi covers Latin-1 plus a handful of extras in 0x80–0x9F. */
const WIN_ANSI_EXTRAS = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ",
  "‰", "Š", "‹", "Œ", "Ž", "‘", "’", "“",
  "”", "•", "–", "—", "˜", "™", "š", "›",
  "œ", "ž", "Ÿ",
]);

function encodable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === "\n" || ch === "\r" || ch === "\t") return true;
  if (code >= 0x20 && code <= 0x7e) return true; // ASCII printable
  if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 supplement
  return WIN_ANSI_EXTRAS.has(ch);
}

/** Characters our own UI produces that aren't worth a "?" */
const DIRECT: Record<string, string> = {
  "→": "->",
  "←": "<-",
  " ": " ",
  " ": " ",
  "​": "",
  "️": "", // emoji variation selector
};

/**
 * Romanisation for the scripts a US brokerage realistically encounters on a
 * contract. "Дмитрий Иванов" reads as "Dmitrii Ivanov" on the certificate
 * instead of "? ?" — legible and checkable against ID, which matters when the
 * page is evidence. Scripts we can't romanise sensibly (CJK, emoji) still fall
 * through to "?", with the exact text preserved in the audit trail.
 */
const ROMANISE: Record<string, string> = {
  // Cyrillic (Russian/Ukrainian core)
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", є: "ie", ё: "e",
  ж: "zh", з: "z", и: "i", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e",
  ю: "iu", я: "ia",
  // Greek
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
  κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
  ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

function romanise(ch: string): string | null {
  const lower = ch.toLowerCase();
  const mapped = ROMANISE[lower];
  if (mapped === undefined) return null;
  if (!mapped) return "";
  // Preserve capitalisation: "Д" → "D", not "d".
  return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
}

/**
 * Returns text guaranteed to be drawable with the standard PDF fonts.
 * `changed` reports whether any substitution occurred, so callers can tell the
 * user their text couldn't be reproduced exactly.
 */
export function toDrawable(input: string | null | undefined): { text: string; changed: boolean } {
  const raw = String(input ?? "");
  if (!raw) return { text: "", changed: false };

  let out = "";
  let changed = false;

  for (const ch of raw) {
    if (encodable(ch)) {
      out += ch;
      continue;
    }
    if (ch in DIRECT) {
      const rep = DIRECT[ch];
      if (rep !== ch) changed = true;
      out += rep;
      continue;
    }
    // Strip diacritics first — this both handles Latin decomposition and
    // reduces accented Greek (ώ → ω) to a form the romaniser knows.
    const folded = ch.normalize("NFKD").replace(/\p{M}+/gu, "");
    if (folded && [...folded].every(encodable)) {
      out += folded;
      changed = changed || folded !== ch;
      continue;
    }
    // Cyrillic/Greek → Latin, so a real name stays readable on the page.
    const roman = [...(folded || ch)].map(romanise);
    if (roman.length && roman.every((r) => r !== null)) {
      out += roman.join("");
      changed = true;
      continue;
    }
    // Non-Latin script or emoji — keep the slot so spacing/word count survives.
    out += "?";
    changed = true;
  }

  // Collapse runs of replacements so a CJK name doesn't become a wall of "?".
  const collapsed = out.replace(/\?{2,}/g, "?");
  return { text: collapsed, changed: changed || collapsed !== out };
}

/** Convenience for call sites that don't need to know whether it changed. */
export function drawable(input: string | null | undefined): string {
  return toDrawable(input).text;
}
