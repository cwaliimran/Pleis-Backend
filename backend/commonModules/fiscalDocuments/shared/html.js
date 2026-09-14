const { resolveLocale } = require("../locales");

function formatZagreb(date, locale = "en") {
  if (!date) return "";
  const intlLocale = resolveLocale(locale) === "hr" ? "hr-HR" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatMoney(amount, currency = "EUR") {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillRawTokens(html, tokens) {
  Object.entries(tokens).forEach(([token, value]) => {
    html = html.split(`{{${token}}}`).join(value == null ? "" : String(value));
  });
  return html;
}

function fillEscapedTokens(html, tokens) {
  const escaped = {};
  Object.entries(tokens).forEach(([token, value]) => {
    escaped[token] = escapeHtml(value == null ? "" : String(value));
  });
  return fillRawTokens(html, escaped);
}

module.exports = {
  formatZagreb,
  formatMoney,
  escapeHtml,
  fillRawTokens,
  fillEscapedTokens,
};
