#!/usr/bin/env node
/**
 * remove-console-logs.js
 *
 * Recursively scans a directory for JS/TS files and removes
 * console.log(...) statements from them.
 *
 * Usage:
 *   node remove-console-logs.js [targetDir] [--dry-run]
 *
 * Examples:
 *   node remove-console-logs.js .                # clean current dir
 *   node remove-console-logs.js ./src --dry-run   # preview only, no writes
 */

const fs = require("fs");
const path = require("path");

const CONSOLE_METHODS = ["log"]; // add "warn", "error", "info", "debug" if desired
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetDir = args.find((a) => !a.startsWith("--")) || ".";

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripConsoleCalls(source) {
  const methodsPattern = CONSOLE_METHODS.join("|");
  const callStart = new RegExp(`console\\.(?:${methodsPattern})\\s*\\(`, "g");

  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = callStart.exec(source)) !== null) {
    const start = match.index;
    let i = callStart.lastIndex;
    let depth = 1;
    let inString = null;

    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (inString) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === inString) inString = null;
      } else if (ch === "'" || ch === '"' || ch === "`") {
        inString = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      }
      i++;
    }

    let end = i;
    while (source[end] === " " || source[end] === "\t") end++;
    if (source[end] === ";") end++;

    let lineStart = start;
    while (
      lineStart > 0 &&
      (source[lineStart - 1] === " " || source[lineStart - 1] === "\t")
    ) {
      lineStart--;
    }
    const isLineStart = lineStart === 0 || source[lineStart - 1] === "\n";

    let lineEnd = end;
    while (source[lineEnd] === " " || source[lineEnd] === "\t") lineEnd++;
    const isLineEnd = source[lineEnd] === "\n" || lineEnd === source.length;

    let removeStart = start;
    let removeEnd = end;
    if (isLineStart && isLineEnd) {
      removeStart = lineStart;
      removeEnd = source[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
    }

    result += source.slice(lastIndex, removeStart);
    lastIndex = removeEnd;
    callStart.lastIndex = i;
  }

  result += source.slice(lastIndex);
  return result;
}

function main() {
  const absTarget = path.resolve(targetDir);
  if (!fs.existsSync(absTarget)) {
    console.error(`Target path does not exist: ${absTarget}`);
    process.exit(1);
  }

  const stat = fs.statSync(absTarget);
  const files = stat.isDirectory() ? walk(absTarget) : [absTarget];

  let changedCount = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    const cleaned = stripConsoleCalls(original);

    if (cleaned !== original) {
      changedCount++;
      console.log(`${dryRun ? "[dry-run] Would clean" : "Cleaned"}: ${file}`);
      if (!dryRun) {
        fs.writeFileSync(file, cleaned, "utf8");
      }
    }
  }

  console.log(
    `\nDone. ${changedCount} file(s) ${dryRun ? "would be" : "were"} modified out of ${files.length} scanned.`,
  );
}

main();
