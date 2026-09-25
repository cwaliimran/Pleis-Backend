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
 * Smart open: try app scheme, then show store / web fallbacks.
 * @param {{ appLink: string, title?: string }} opts
 */
function renderSmartOpenHtml({ appLink, title = "PLEIS" }) {
  const { ios, android, web } = getStoreUrls();
  const safeTitle = String(title || "PLEIS").replace(/</g, "");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0c1210" />
    <title>Open ${safeTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg0: #0c1210;
        --bg1: #152019;
        --ink: #f4f7f4;
        --muted: #9aada2;
        --accent: #7dffb3;
        --accent-dim: rgba(125, 255, 179, 0.14);
        --line: rgba(244, 247, 244, 0.1);
        --btn: #161f1a;
        --btn-hover: #1f2b24;
        --shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      html, body {
        min-height: 100%;
        background: var(--bg0);
        color: var(--ink);
        font-family: "Outfit", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      body {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 28px 20px;
        background:
          radial-gradient(ellipse 80% 55% at 50% -10%, rgba(125, 255, 179, 0.18), transparent 55%),
          radial-gradient(ellipse 60% 40% at 100% 100%, rgba(60, 120, 90, 0.22), transparent 50%),
          radial-gradient(ellipse 50% 35% at 0% 80%, rgba(40, 80, 70, 0.25), transparent 45%),
          var(--bg0);
      }

      .shell {
        width: min(420px, 100%);
        text-align: center;
        animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      @keyframes rise {
        from { opacity: 0; transform: translateY(18px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .mark {
        display: inline-grid;
        place-items: center;
        width: 72px;
        height: 72px;
        margin-bottom: 22px;
        border-radius: 22px;
        background: linear-gradient(145deg, #1a2b22, #0f1813);
        border: 1px solid var(--line);
        box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.06);
        font-family: "Syne", sans-serif;
        font-weight: 800;
        font-size: 1.55rem;
        letter-spacing: -0.04em;
        color: var(--accent);
      }

      h1 {
        font-family: "Syne", sans-serif;
        font-weight: 800;
        font-size: clamp(2.1rem, 8vw, 2.75rem);
        letter-spacing: -0.05em;
        line-height: 0.95;
        margin-bottom: 10px;
      }

      .status {
        color: var(--muted);
        font-size: 1.02rem;
        font-weight: 500;
        line-height: 1.45;
        max-width: 28ch;
        margin: 0 auto 28px;
        min-height: 3em;
        transition: opacity 0.35s ease;
      }

      .status strong { color: var(--ink); font-weight: 600; }

      .pulse {
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: 8px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 0 0 var(--accent-dim);
        animation: pulse 1.4s ease-out infinite;
        vertical-align: middle;
      }

      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(125, 255, 179, 0.55); }
        70% { box-shadow: 0 0 0 12px rgba(125, 255, 179, 0); }
        100% { box-shadow: 0 0 0 0 rgba(125, 255, 179, 0); }
      }

      .stores {
        display: grid;
        gap: 12px;
      }

      .store {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 16px;
        background: var(--btn);
        border: 1px solid var(--line);
        color: inherit;
        text-decoration: none;
        text-align: left;
        transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      }

      .store:hover,
      .store:focus-visible {
        background: var(--btn-hover);
        border-color: rgba(125, 255, 179, 0.35);
        transform: translateY(-2px);
        outline: none;
      }

      .store:active { transform: translateY(0); }

      .icon {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
      }

      .icon svg { width: 26px; height: 26px; display: block; }

      .label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .label small {
        font-size: 0.72rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
        font-weight: 500;
      }
      .label span {
        font-family: "Syne", sans-serif;
        font-weight: 700;
        font-size: 1.05rem;
        letter-spacing: -0.02em;
      }

      .chev {
        margin-left: auto;
        opacity: 0.35;
        font-size: 1.2rem;
      }

      .retry {
        margin-top: 18px;
        background: none;
        border: none;
        color: var(--accent);
        font: inherit;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 4px;
        opacity: 0.9;
      }

      .retry:hover { opacity: 1; }

      .web {
        display: inline-block;
        margin-top: 22px;
        color: var(--muted);
        font-size: 0.9rem;
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: color 0.2s, border-color 0.2s;
      }

      .web:hover {
        color: var(--ink);
        border-bottom-color: var(--line);
      }

      @media (prefers-reduced-motion: reduce) {
        .shell, .pulse { animation: none; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="mark" aria-hidden="true">P</div>
      <h1>PLEIS</h1>
      <p class="status" id="status">
        <span class="pulse" aria-hidden="true"></span>
        Opening <strong>${safeTitle}</strong>…
      </p>

      <div class="stores" role="navigation" aria-label="Download the app">
        <a class="store" id="iosStore" href="${ios}" rel="noopener noreferrer">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
          </span>
          <span class="label">
            <small>Download on the</small>
            <span>App Store</span>
          </span>
          <span class="chev" aria-hidden="true">›</span>
        </a>

        <a class="store" id="androidStore" href="${android}" rel="noopener noreferrer">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M3.61 2.04 13.42 12l-9.81 9.96A1.99 1.99 0 0 1 2 20.48V3.52c0-.64.3-1.22.8-1.59.28-.2.6-.32.81-.32v.43z"/>
              <path fill="#FBBC04" d="m13.42 12 2.83-2.88 4.22 2.4c.72.41.72 1.55 0 1.96l-4.22 2.4L13.42 12z"/>
              <path fill="#4285F4" d="M3.61 21.96 13.42 12l2.83 2.88-9.53 5.44a2.05 2.05 0 0 1-3.11.64z"/>
              <path fill="#34A853" d="M13.42 12 3.61 2.04a2.05 2.05 0 0 1 3.11-.64l9.53 5.44L13.42 12z"/>
            </svg>
          </span>
          <span class="label">
            <small>Get it on</small>
            <span>Google Play</span>
          </span>
          <span class="chev" aria-hidden="true">›</span>
        </a>
      </div>

      <button type="button" class="retry" id="retry" hidden>Try opening the app again</button>
      <a class="web" href="${web}" rel="noopener noreferrer">Continue on the web</a>
    </main>

    <script>
      (function () {
        const appLink = ${JSON.stringify(appLink)};
        const iosFallback = ${JSON.stringify(ios)};
        const androidFallback = ${JSON.stringify(android)};
        const displayTitle = ${JSON.stringify(safeTitle)};
        const statusEl = document.getElementById("status");
        const retryBtn = document.getElementById("retry");
        const ua = navigator.userAgent || navigator.vendor || window.opera || "";
        const isAndroid = /android/i.test(ua);
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        let leftPage = false;

        document.addEventListener("visibilitychange", function () {
          if (document.hidden) leftPage = true;
        });
        window.addEventListener("pagehide", function () { leftPage = true; });
        window.addEventListener("blur", function () { leftPage = true; });

        function openApp() {
          leftPage = false;
          statusEl.innerHTML = '<span class="pulse" aria-hidden="true"></span>Opening <strong>' + displayTitle + '</strong>…';
          retryBtn.hidden = true;
          window.location.href = appLink;
        }

        function showFallback() {
          if (leftPage) return;
          statusEl.innerHTML = "App didn’t open? Grab it from the store:";
          retryBtn.hidden = false;
        }

        function softStoreRedirect() {
          if (leftPage) return;
          if (isAndroid) window.location.href = androidFallback;
          else if (isIOS) window.location.href = iosFallback;
        }

        retryBtn.addEventListener("click", openApp);
        openApp();
        setTimeout(showFallback, 1600);
        setTimeout(softStoreRedirect, 2800);
      })();
    </script>
  </body>
</html>`;
}

module.exports = {
  getStoreUrls,
  renderSmartOpenHtml,
};
