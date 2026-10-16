/**
 * Curated profanity blocklist for end-user text (not a generic English dictionary).
 *
 * Matching uses whole Unicode words only (`\p{L}+`), so Croatian copy like
 * "analiza", "koktel", or "5 puta" is not flagged by substring rules.
 * Diacritics are normalized so "pička" matches the "picka" entry.
 *
 * Extend this list deliberately when you see abuse — do not import huge
 * multilingual blocklists (high false-positive rate for HR content).
 */

const BLOCKED_TERMS = new Set([
  // Croatian
  "kurac",
  "picka",
  "pizda",
  "sranje",
  "govno",
  "jebem",
  "jebes",
  "jebeno",
  "jebo",
  "jebati",
  "odjebi",
  "pederu",
  "peder",
  // English (common in bilingual UGC)
  "fuck",
  "fucking",
  "fucker",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "whore",
  "slut",
  "nigger",
  "nigga",
  "faggot",
  "retard",
]);

function stripDiacritics(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeToken(token) {
  return stripDiacritics(token.normalize("NFC")).toLowerCase();
}

function containsBlockedLanguage(text) {
  if (typeof text !== "string" || !text.trim()) {
    return false;
  }

  const tokens = text.match(/\p{L}+/gu) || [];
  for (const token of tokens) {
    if (BLOCKED_TERMS.has(normalizeToken(token))) {
      return true;
    }
  }

  return false;
}

module.exports = {
  BLOCKED_TERMS,
  containsBlockedLanguage,
  normalizeToken,
};
