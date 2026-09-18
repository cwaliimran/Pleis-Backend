const {
  resolvePleisWeb,
  resolvePleisAppScheme,
  resolvePleisIosStoreUrl,
  resolvePleisAndroidStoreUrl,
} = require("../config/CONSTANTS");

function getStoreUrls() {
  return {
    ios: resolvePleisIosStoreUrl(),
    android: resolvePleisAndroidStoreUrl(),
    web: resolvePleisWeb(),
    scheme: resolvePleisAppScheme(),
  };
}

/**
 * Smart open: try app scheme, then store / web fallbacks.
 * @param {{ appLink: string, title?: string }} opts
 */
function renderSmartOpenHtml({ appLink, title = "PLEIS" }) {
  const { ios, android, web } = getStoreUrls();
  const safeTitle = String(title || "PLEIS").replace(/</g, "");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Opening ${safeTitle}...</title>
    <script>
      function openApp() {
        const appLink = ${JSON.stringify(appLink)};
        const iosFallback = ${JSON.stringify(ios)};
        const androidFallback = ${JSON.stringify(android)};
        const webFallback = ${JSON.stringify(web)};
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        window.location = appLink;
        setTimeout(() => {
          if (/android/i.test(userAgent)) {
            window.location = androidFallback;
          } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            window.location = iosFallback;
          } else {
            window.location = webFallback;
          }
        }, 1500);
      }
      window.onload = openApp;
    </script>
  </head>
  <body>
    <p style="text-align:center;margin-top:40vh;font-family:sans-serif;">
      Opening <b>${safeTitle}</b>...
    </p>
  </body>
</html>`;
}

module.exports = {
  getStoreUrls,
  renderSmartOpenHtml,
};
