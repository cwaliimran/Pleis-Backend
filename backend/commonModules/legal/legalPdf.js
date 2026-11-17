/**
 * PDF download of a legal document version (spec 1.5: "Partner Service Agreement
 * (download PDF)"). Versions are immutable, so each rendered PDF is cached in memory.
 */
const { htmlToPdfBuffer } = require("../fiscalDocuments/invoice/htmlToPdf");

const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatDate = (d) => {
  const date = d ? new Date(d) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}.`;
};

const renderLegalDocumentHtml = (doc) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)} v${escapeHtml(doc.version)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #14181F; font-size: 11pt; line-height: 1.5; }
  header { border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 16px; }
  header h1 { font-size: 18pt; margin: 0 0 4px; }
  header .meta { color: #6B7280; font-size: 9pt; }
  h1, h2, h3 { line-height: 1.25; }
  ul, ol { padding-left: 1.4em; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #d1d5db; padding: 4px 6px; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(doc.title)}</h1>
    <div class="meta">Version ${escapeHtml(doc.version)}${doc.effectiveDate ? ` · effective ${escapeHtml(formatDate(doc.effectiveDate))}` : ""}</div>
  </header>
  <main>${doc.content || ""}</main>
</body></html>`;

const MAX_CACHED = 20;
const cache = new Map(); // `${type}@${version}` → Buffer

const legalDocumentPdf = async (doc) => {
  const key = `${doc.type}@${doc.version}`;
  if (cache.has(key)) return cache.get(key);
  const pdf = await htmlToPdfBuffer(renderLegalDocumentHtml(doc));
  cache.set(key, pdf);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  return pdf;
};

const pdfFileName = (doc) =>
  `${String(doc.title || doc.type).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}-v${doc.version}.pdf`;

module.exports = { renderLegalDocumentHtml, legalDocumentPdf, pdfFileName };
