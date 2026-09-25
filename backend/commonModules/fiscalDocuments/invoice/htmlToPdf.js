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
 * Prefer puppeteer-core + @sparticuz/chromium (Azure App Service / Linux),
 * then explicit/system Chrome, then full puppeteer if present.
 */
async function resolveLaunch() {
  const puppeteerCore = tryRequire("puppeteer-core");
  const chromium = tryRequire("@sparticuz/chromium");

  if (puppeteerCore && chromium) {
    try {
      return {
        puppeteer: puppeteerCore,
        options: {
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        },
        engine: "sparticuz-chromium",
      };
    } catch {
      // Binary may be Linux-only; fall through to system Chrome on macOS/dev.
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
