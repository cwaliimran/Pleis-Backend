/**
 * IBAN mod-97 and Croatian OIB mod-11 checks (Payout §5.3 / §9).
 * Charset sanitizer for pain.001 fields (§6.5).
 */

function normalizeIban(iban) {
  return String(iban || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function isValidIbanChecksum(iban) {
  const cleaned = normalizeIban(iban);
  if (!/^[A-Z]{2}[0-9]{2}[A-Za-z0-9]{1,30}$/.test(cleaned)) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let expanded = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) expanded += String(code - 55);
    else expanded += ch;
  }
  let remainder = 0;
  for (let i = 0; i < expanded.length; i += 7) {
    const block = String(remainder) + expanded.slice(i, i + 7);
    remainder = Number(BigInt(block) % 97n);
  }
  return remainder === 1;
}

function isValidOib(oib) {
  const s = String(oib || "").trim();
  if (!/^\d{11}$/.test(s)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(s[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  let control = 11 - a;
  if (control === 10) control = 0;
  return control === Number(s[10]);
}

function sanitizePainText(value, maxLen = 70, { allowNational = true } = {}) {
  let s = String(value || "");
  if (!allowNational) s = s.replace(/[ČĆŠŽĐčćšžđ]/g, "");
  s = s.replace(/[^a-zA-Z0-9/\-?:().,'+ ČĆŠŽĐčćšžđ]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  while (s.startsWith("-") || s.startsWith(" ") || s.startsWith("/")) {
    s = s.slice(1).trim();
  }
  while (s.endsWith("/")) s = s.slice(0, -1).trim();
  s = s.replace(/\/+/g, "/");
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  while (s.endsWith("/")) s = s.slice(0, -1).trim();
  return s;
}

function isCroatianIban(iban) {
  return normalizeIban(iban).startsWith("HR");
}

module.exports = {
  normalizeIban,
  isValidIbanChecksum,
  isValidOib,
  sanitizePainText,
  isCroatianIban,
};
