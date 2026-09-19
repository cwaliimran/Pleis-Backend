const fs = require("fs");
const path = require("path");

const LOGO_FILENAME = "pleis-logo.png";
const LOGO_PATH = path.join(__dirname, "../assets", LOGO_FILENAME);
const LOGO_CID = LOGO_FILENAME;

let cachedDataUri = null;
let cachedBuffer = null;

function loadLogoBuffer() {
  if (cachedBuffer) return cachedBuffer;
  if (!fs.existsSync(LOGO_PATH)) return null;
  cachedBuffer = fs.readFileSync(LOGO_PATH);
  return cachedBuffer;
}

function loadLogoDataUri() {
  if (cachedDataUri) return cachedDataUri;
  const buffer = loadLogoBuffer();
  if (!buffer) return "";
  cachedDataUri = `data:image/png;base64,${buffer.toString("base64")}`;
  return cachedDataUri;
}

/**
 * Prefer a public HTTPS URL (best for email clients).
 * For outbound Mailgun HTML use cid: so the logo is inlined.
 * For PDF / local HTML previews embed a small data URI from assets.
 */
function resolveLogoSrc({ forEmail = false } = {}) {
  const hosted = String(process.env.PLEIS_LOGO_URL || "").trim();
  if (hosted) return hosted;
  if (forEmail && loadLogoBuffer()) return `cid:${LOGO_CID}`;
  return loadLogoDataUri();
}

function logoInlineAttachment() {
  const data = loadLogoBuffer();
  if (!data) return null;
  return {
    filename: LOGO_FILENAME,
    data,
    contentType: "image/png",
  };
}

module.exports = {
  LOGO_FILENAME,
  LOGO_CID,
  LOGO_PATH,
  loadLogoBuffer,
  loadLogoDataUri,
  resolveLogoSrc,
  logoInlineAttachment,
};
