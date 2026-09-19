const {
  resolvePleisWeb,
  resolvePleisAppScheme,
  resolvePleisIosStoreUrl,
  resolvePleisAndroidStoreUrl,
} = require("../../../config/CONSTANTS");
const { renderSmartOpenHtml } = require("../../../helperUtils/appDeepLinkUtil");

function withTrailingSlash(url) {
  const base = String(url || "").trim();
  if (!base) return "";
  return base.endsWith("/") ? base : `${base}/`;
}

function sanitizeOpenId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 64);
}

function storeUrls() {
  return {
    ios: resolvePleisIosStoreUrl(),
    android: resolvePleisAndroidStoreUrl(),
    web: resolvePleisWeb(),
    scheme: resolvePleisAppScheme(),
  };
}

function buildAppSchemeLink(confirmationNumber) {
  const { scheme } = storeUrls();
  const id = sanitizeOpenId(confirmationNumber);
  return id ? `${scheme}://wallet/${id}` : `${scheme}://wallet`;
}

function buildConfirmationOpenUrl(confirmationNumber) {
  const base = withTrailingSlash(process.env.API_BASE_URL);
  if (!base) {
    return resolvePleisWeb();
  }
  const id = encodeURIComponent(sanitizeOpenId(confirmationNumber) || "wallet");
  return `${base}app/open?id=${id}`;
}

function renderOpenAppHtml(confirmationNumber) {
  return renderSmartOpenHtml({
    appLink: buildAppSchemeLink(confirmationNumber),
    title: "PLEIS",
  });
}

function openConfirmationInApp(req, res) {
  const id = req.query.id || req.query.confirmation || "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(renderOpenAppHtml(id));
}

module.exports = {
  buildConfirmationOpenUrl,
  buildAppSchemeLink,
  renderOpenAppHtml,
  openConfirmationInApp,
};
