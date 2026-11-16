const {
  resolvePleisWeb,
  resolvePleisAppScheme,
  resolvePleisIosStoreUrl,
  resolvePleisAndroidStoreUrl,
  buildPleisLink,
} = require("../../../config/CONSTANTS");
const { renderSmartOpenHtml, sendSmartOpen } = require("../../../helperUtils/appDeepLinkUtil");

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
  const id = encodeURIComponent(sanitizeOpenId(confirmationNumber) || "wallet");
  return buildPleisLink(`api/v1/app/open?id=${id}`) || resolvePleisWeb();
}

function renderOpenAppHtml(confirmationNumber) {
  return renderSmartOpenHtml({
    appLink: buildAppSchemeLink(confirmationNumber),
    title: "PLEIS",
  });
}

function openConfirmationInApp(req, res) {
  const id = req.query.id || req.query.confirmation || "";
  return sendSmartOpen(req, res, { appLink: buildAppSchemeLink(id), title: "PLEIS" });
}

module.exports = {
  buildConfirmationOpenUrl,
  buildAppSchemeLink,
  renderOpenAppHtml,
  openConfirmationInApp,
};
