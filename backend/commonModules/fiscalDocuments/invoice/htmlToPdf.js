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

async function htmlToPdfBuffer(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pleis-invoice-"));
  const htmlPath = path.join(dir, "invoice.html");
  const pdfPath = path.join(dir, "invoice.pdf");
  fs.writeFileSync(htmlPath, html, "utf8");

  try {
    let puppeteer;
    try {
      puppeteer = require("puppeteer");
    } catch {
      puppeteer = null;
    }

    if (puppeteer) {
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath: chromeExecutable() || undefined,
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        return await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
        });
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

module.exports = { htmlToPdfBuffer, chromeExecutable };
