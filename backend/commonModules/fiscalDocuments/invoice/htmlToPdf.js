const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function chromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((file) => fs.existsSync(file)) || "";
}

function runChromePdf(chromePath, htmlPath, pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--print-to-pdf=${pdfPath}`,
        "--print-to-pdf-no-header",
        `file://${htmlPath}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`chrome_pdf_exit_${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

/**
 * @sparticuz/chromium ships Chromium plus the system libraries it needs
 * (libnss3, libnspr4, …) but unpacks those libraries only on AWS. The Azure
 * App Service image has none of them, so unpack them here too and hand their
 * folder to the Chromium process alone (not to the rest of the server).
 * Everything goes to /tmp: nothing is installed, and a restart just unpacks again.
 */
async function sparticuzLaunchEnv(chromiumModule) {
  const binDir = path.join(path.dirname(require.resolve("@sparticuz/chromium")), "..", "bin");
  const libDir = path.join(os.tmpdir(), "al2023", "lib");
  if (!fs.existsSync(libDir)) {
    await chromiumModule.inflate(path.join(binDir, "al2023.tar.br"));
  }
  const inherited = process.env.LD_LIBRARY_PATH;
  return {
    ...process.env,
    LD_LIBRARY_PATH: inherited ? `${libDir}:${inherited}` : libDir,
    FONTCONFIG_PATH: process.env.FONTCONFIG_PATH || path.join(os.tmpdir(), "fonts"),
  };
}

/**
 * Prefer puppeteer-core + @sparticuz/chromium (Azure App Service / Linux),
 * then explicit/system Chrome, then full puppeteer if present.
 */
async function resolveLaunch() {
  const puppeteerCore = tryRequire("puppeteer-core");
  // @sparticuz/chromium is an ES module: require() returns { default: Chromium }.
  const chromiumModule = tryRequire("@sparticuz/chromium");
  const chromium = chromiumModule?.default ?? chromiumModule;

  if (puppeteerCore && chromium && process.platform === "linux") {
    try {
      return {
        puppeteer: puppeteerCore,
        options: {
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          env: await sparticuzLaunchEnv(chromiumModule),
          headless: "shell",
        },
        engine: "sparticuz-chromium",
      };
    } catch (err) {
      console.error("[html-to-pdf] @sparticuz/chromium unavailable:", err?.message || err);
    }
  }

  const chrome = chromeExecutable();
  if (puppeteerCore && chrome) {
    return {
      puppeteer: puppeteerCore,
      options: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        executablePath: chrome,
      },
      engine: "puppeteer-core+system-chrome",
    };
  }

  const puppeteer = tryRequire("puppeteer");
  if (puppeteer) {
    return {
      puppeteer,
      options: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath: chrome || undefined,
      },
      engine: "puppeteer",
    };
  }

  return null;
}

async function htmlToPdfBuffer(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pleis-invoice-"));
  const htmlPath = path.join(dir, "invoice.html");
  const pdfPath = path.join(dir, "invoice.pdf");
  fs.writeFileSync(htmlPath, html, "utf8");

  try {
    const launch = await resolveLaunch();
    if (launch) {
      const browser = await launch.puppeteer.launch(launch.options);
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
        });
        return Buffer.from(pdf);
      } finally {
        await browser.close();
      }
    }

    const chrome = chromeExecutable();
    if (!chrome) {
      throw new Error("html_to_pdf_engine_missing");
    }
    await runChromePdf(chrome, htmlPath, pdfPath);
    return fs.readFileSync(pdfPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { htmlToPdfBuffer, chromeExecutable, resolveLaunch };
