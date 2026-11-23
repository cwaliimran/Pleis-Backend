/**
 * Public side of the QR / share deep links (#82, #84; D-01, D-13).
 *
 *   GET <link base>q/<token>              open page (app, or the store without it)
 *   GET /.well-known/assetlinks.json      Android App Links verification
 *   GET /.well-known/apple-app-site-association   iOS Universal Links
 *
 * With the app installed and the domain verified the OS opens the app
 * directly and this page is never shown.
 */
const express = require("express");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const { sendSmartOpen } = require("../../helperUtils/appDeepLinkUtil");
const {
  resolvePleisWeb,
  resolvePleisAndroidPackage,
  resolvePleisAndroidCertFingerprints,
  resolvePleisIosAppIds,
} = require("../../config/CONSTANTS");
const { isValidToken, resolveToken, buildAppLink } = require("./qrLinks");

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const renderInvalidCodeHtml = () => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PLEIS</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0c1210; color: #f4f7f4;
             font-family: system-ui, sans-serif; text-align: center; padding: 24px; box-sizing: border-box; }
      p { color: #9aada2; max-width: 30ch; margin: 8px auto 0; line-height: 1.45; }
      a { color: #7dffb3; }
    </style>
  </head>
  <body>
    <main>
      <h1>PLEIS</h1>
      <p>This code is not valid any more.</p>
      <p><a href="${escapeHtml(resolvePleisWeb())}">pleis</a></p>
    </main>
  </body>
</html>`;

// Paths the apps claim. Keep in sync with the Android intent filter
// (AndroidManifest.xml) and the iOS associated domains.
// "/api/v1/app/open" is "Open in the app" in payment emails: with the app
// installed it opens straight in the app (OpenLink screen), otherwise the
// browser shows the open page with the store buttons.
// Paths the installed apps claim, so the OS opens the app instead of the browser.
// Referral invites (/api/v1/app/global-referral/share?id=) are not listed:
// every iOS build with this domain would claim them, including builds that
// don't open sign-up, and the open page would never run. Android claims that
// path in the app manifest, which ships with the build that handles it.
const APP_LINK_PATHS = ["/q/*", "/api/v1/q/*", "/api/v1/share", "/api/v1/share/*", "/api/v1/app/open"];

const assetLinks = () => {
  const fingerprints = resolvePleisAndroidCertFingerprints();
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: resolvePleisAndroidPackage(),
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
};

const appleAppSiteAssociation = () => {
  const appIDs = resolvePleisIosAppIds();
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs,
          appID: appIDs[0],
          paths: APP_LINK_PATHS,
          components: APP_LINK_PATHS.map((path) => ({ "/": path })),
        },
      ],
    },
  };
};

/** Mounted at the server root: `/.well-known/...`. */
const wellKnownRouter = express.Router();
wellKnownRouter.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.json(assetLinks());
});
wellKnownRouter.get(["/.well-known/apple-app-site-association", "/apple-app-site-association"], (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.type("application/json").send(JSON.stringify(appleAppSiteAssociation()));
});

/** Mounted at `/q` and `/api/v1/q`. */
const qrLinkRouter = express.Router();
qrLinkRouter.get("/:token", createRateLimiter("QrLink"), async (req, res) => {
  const { token } = req.params;
  const sendInvalid = (status) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(status).send(renderInvalidCodeHtml());
  };
  try {
    const resolved = isValidToken(token) ? await resolveToken(token) : null;
    if (!resolved) return sendInvalid(404);
    // A table code scanned with the phone camera lands here: Android goes
    // straight into the app, which resolves the token and selects the table.
    return sendSmartOpen(req, res, { appLink: buildAppLink(token), title: "PLEIS" });
  } catch (error) {
    return sendInvalid(500);
  }
});

module.exports = { qrLinkRouter, wellKnownRouter, APP_LINK_PATHS };
