#!/usr/bin/env node
/**
 * Scans backend/ for API response patterns that do NOT use sendResponse.
 * Classifies each hit as "migrate" or "exception".
 *
 * Usage: node backend/findNonSendResponse.js
 *        node backend/findNonSendResponse.js --migrate-only
 *        node backend/findNonSendResponse.js --summary
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const MIGRATE_ONLY = process.argv.includes("--migrate-only");
const SUMMARY_ONLY = process.argv.includes("--summary");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "coverage",
  "dist",
  "build",
  "uploads",
  "logs",
]);

const SKIP_FILES = [
  /findNonSendResponse\.js$/,
  /checkTranslationKeys\.js$/,
  /responseUtil\.js$/,
];

/** Path / snippet heuristics for known legitimate exceptions */
const EXCEPTION_RULES = [
  {
    category: "exception:responseUtil",
    test: (rel) => /helperUtils[\\/]responseUtil\.js$/.test(rel),
  },
  {
    category: "exception:health_or_root",
    test: (rel, snippet) =>
      /server\.js$/.test(rel) &&
      (/"\/api"|\/health|name:\s*"Pleis API"|status:\s*"ok"|uptime:/.test(
        snippet
      )),
  },
  {
    category: "exception:webhook_ack",
    test: (rel, snippet) =>
      /webhook/i.test(rel) ||
      /webhook/i.test(snippet) ||
      /\bACK\b|received:\s*true|"ok"\s*[,}]/.test(snippet),
  },
  {
    category: "exception:html_or_binary",
    test: (rel, snippet) =>
      /res\.send\s*\(/.test(snippet) &&
      (/<!DOCTYPE|text\/html|application\/pdf|text\/csv|application\/xml|image\/|Content-Disposition|setHeader\s*\(\s*['"]Content-Type/i.test(
        snippet
      ) ||
        /payment.*page|html|csv|pdf|xml|download/i.test(rel + snippet)),
  },
  {
    category: "exception:html_payment_page",
    test: (rel, snippet) =>
      (/monri|payment/i.test(rel) &&
        (/res\.send\s*\(/.test(snippet) ||
          /<!DOCTYPE|text\/html|\.html|renderPayment|paymentPage/i.test(
            snippet
          ))),
  },
  {
    category: "exception:download_stream",
    test: (rel, snippet) =>
      /res\.(download|attachment|sendFile|pipe)\s*\(/.test(snippet) ||
      /Content-Disposition|application\/octet-stream|text\/csv|application\/pdf/i.test(
        snippet
      ),
  },
];

const RESPONSE_PATTERNS = [
  {
    name: "res.status().json()",
    // Matches res.status(...).json(...) including multiline-ish via line scan
    regex: /res\s*\.\s*status\s*\([^)]*\)\s*\.\s*json\s*\(/g,
  },
  {
    name: "res.json()",
    regex: /res\s*\.\s*json\s*\(/g,
  },
  {
    name: "res.send()",
    regex: /res\s*\.\s*send\s*\(/g,
  },
  {
    name: "res.status().send()",
    regex: /res\s*\.\s*status\s*\([^)]*\)\s*\.\s*send\s*\(/g,
  },
];

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(js|ts|mjs|cjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function isInsideSendResponseCall(content, matchIndex) {
  // Walk backwards for a nearby sendResponse({ ... }) that contains this res.status().json
  // sendResponse internally calls res.status().json — already skipped via SKIP_FILES for responseUtil.
  // For callers: if the match is NOT a direct call but somehow nested — rare.
  // Heuristic: if previous non-whitespace before match is part of sendResponse — no.
  // Better: check if match sits inside a sendResponse invocation window.
  const lookback = content.slice(Math.max(0, matchIndex - 80), matchIndex);
  if (/sendResponse\s*\(\s*\{\s*$/.test(lookback.replace(/\s+/g, " "))) {
    return true;
  }
  return false;
}

function extractSnippet(lines, lineIndex, matchCol) {
  const line = lines[lineIndex] || "";
  // Include a few following lines if the call looks unfinished on this line
  let snippet = line.trim();
  let open = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
  let i = lineIndex + 1;
  while (open > 0 && i < lines.length && i < lineIndex + 6) {
    snippet += " " + lines[i].trim();
    open +=
      (lines[i].match(/\(/g) || []).length - (lines[i].match(/\)/g) || []).length;
    i++;
  }
  if (snippet.length > 160) snippet = snippet.slice(0, 157) + "...";
  return snippet;
}

function classify(relPath, snippet, patternName) {
  for (const rule of EXCEPTION_RULES) {
    if (rule.test(relPath, snippet, patternName)) {
      return rule.category;
    }
  }

  // Health endpoints outside server.js
  if (/health|\/api['"]\s*,|status:\s*['"]ok['"]/.test(snippet) && /health/i.test(relPath + snippet)) {
    return "exception:health_or_root";
  }

  // HTML/binary via Content-Type nearby in snippet
  if (
    patternName.includes("send") &&
    /html|pdf|csv|xml|octet-stream|image\//i.test(snippet)
  ) {
    return "exception:html_or_binary";
  }

  // Hardcoded message/error objects → clear migrate
  if (
    /message\s*:|error\s*:|translationKey\s*:|success\s*:/.test(snippet) ||
    patternName.includes("json")
  ) {
    return "migrate";
  }

  if (patternName.includes("send")) {
    return "exception:res_send_review";
  }

  return "migrate";
}

function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (SKIP_FILES.some((re) => re.test(filePath))) return [];

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const findings = [];
  const seen = new Set(); // line+pattern dedupe

  for (const pattern of RESPONSE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      if (isInsideSendResponseCall(content, match.index)) continue;

      // Map index → line number
      const before = content.slice(0, match.index);
      const lineNumber = before.split(/\r?\n/).length;
      const lineIndex = lineNumber - 1;
      const key = `${rel}:${lineNumber}:${pattern.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Avoid double-counting res.status().send when also matching res.send
      if (
        pattern.name === "res.send()" &&
        /res\s*\.\s*status\s*\([^)]*\)\s*\.\s*send\s*\(/.test(
          lines[lineIndex] || ""
        )
      ) {
        continue;
      }
      if (
        pattern.name === "res.json()" &&
        /res\s*\.\s*status\s*\([^)]*\)\s*\.\s*json\s*\(/.test(
          lines[lineIndex] || ""
        )
      ) {
        continue;
      }

      const snippet = extractSnippet(lines, lineIndex, match.index);
      const category = classify(rel, snippet, pattern.name);

      findings.push({
        file: rel,
        line: lineNumber,
        pattern: pattern.name,
        category,
        snippet,
      });
    }
  }

  return findings;
}

function main() {
  const files = walk(ROOT);
  let all = [];
  for (const f of files) {
    all = all.concat(scanFile(f));
  }

  all.sort((a, b) => {
    if (a.category !== b.category) {
      // migrate first
      if (a.category === "migrate") return -1;
      if (b.category === "migrate") return 1;
      return a.category.localeCompare(b.category);
    }
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  const migrate = all.filter((f) => f.category === "migrate");
  const exceptions = all.filter((f) => f.category !== "migrate");

  if (SUMMARY_ONLY) {
    console.log(`Total findings: ${all.length}`);
    console.log(`  migrate:    ${migrate.length}`);
    console.log(`  exceptions: ${exceptions.length}`);
    const byCat = {};
    for (const f of all) {
      byCat[f.category] = (byCat[f.category] || 0) + 1;
    }
    console.log("\nBy category:");
    for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v.toString().padStart(4)}  ${k}`);
    }
    const byFile = {};
    for (const f of migrate) {
      byFile[f.file] = (byFile[f.file] || 0) + 1;
    }
    console.log("\nTop migrate files:");
    Object.entries(byFile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .forEach(([file, count]) => console.log(`  ${count.toString().padStart(3)}  ${file}`));
    return;
  }

  const toPrint = MIGRATE_ONLY ? migrate : all;

  console.log("=".repeat(80));
  console.log("Non-sendResponse API response scan");
  console.log(`Root: ${ROOT}`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`Findings: ${all.length} (migrate: ${migrate.length}, exceptions: ${exceptions.length})`);
  console.log("=".repeat(80));

  let currentCat = null;
  for (const f of toPrint) {
    if (f.category !== currentCat) {
      currentCat = f.category;
      console.log(`\n--- ${currentCat} ---`);
    }
    console.log(
      `${f.file}:${f.line}  [${f.pattern}]\n  ${f.snippet}\n`
    );
  }

  console.log("=".repeat(80));
  console.log(`Done. migrate=${migrate.length} exception=${exceptions.length}`);
}

main();
