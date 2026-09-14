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
    ios:
      process.env.PLEIS_IOS_STORE_URL ||
      "https://apps.apple.com/app/pleisapp/id1234567890",
    android:
      process.env.PLEIS_ANDROID_STORE_URL ||
      "https://play.google.com/store/apps/details?id=com.pleis",
    web: process.env.PLEIS_WEB || "https://pleisapp.com",
    scheme: process.env.PLEIS_APP_SCHEME || "com.pleis",
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
    return process.env.PLEIS_WEB || "https://pleis.hr";
  }
  const id = encodeURIComponent(sanitizeOpenId(confirmationNumber) || "wallet");
  return `${base}app/open?id=${id}`;
}

function renderOpenAppHtml(confirmationNumber) {
  const appLink = buildAppSchemeLink(confirmationNumber);
  const { ios, android, web } = storeUrls();
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Opening ...</title>
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
      Opening <b>PLEIS</b>...
    </p>
  </body>
</html>`;
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
