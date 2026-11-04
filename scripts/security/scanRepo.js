#!/usr/bin/env node
"use strict";

/**
 * Blocks known malware patterns from entering the repository.
 *
 * Reads files as text and never executes or requires them. Uses Node built-ins
 * only, so it is safe to run before `npm ci`.
 *
 *   node scripts/security/scanRepo.js --all          tracked files in the working tree
 *   node scripts/security/scanRepo.js --staged       staged content (pre-commit)
 *   node scripts/security/scanRepo.js --ref <rev>    all files at a commit (pre-push)
 *
 * Exit codes: 0 clean, 1 violations found, 2 scanner error. Callers must treat
 * any non-zero exit as a block. See scripts/security/README.md for allowlisting.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MAX_LINE_LENGTH = 2000;
const MAX_WHITESPACE_RUN = 40;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 1024 * 1024 * 1024;

const CODE_EXTENSIONS = new Set([
  ".js", ".cjs", ".mjs", ".jsx", ".ts", ".cts", ".mts", ".tsx",
  ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".py", ".yml", ".yaml",
]);
const JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".cts", ".mts", ".tsx"]);
const DATA_EXTENSIONS = new Set([".json", ".html", ".htm"]);

// Long lines here are real API response bodies. Every other rule still applies.
const LONG_LINE_ALLOWLIST = new Set([
  "postman_collection/Pleis.postman_collection.json",
  "postman_collection/Pleis.postman_collectionv2.json",
]);

// Files with a reviewed reason to start child processes.
const CHILD_PROCESS_ALLOWLIST = new Set([
  "backend/commonModules/fiscalDocuments/invoice/htmlToPdf.js",
  "backend/helperUtils/dataBaseBackup.js",
  "scripts/security/scanRepo.js",
]);

// Packages reviewed as needing npm install scripts. A new one must be reviewed.
const INSTALL_SCRIPT_ALLOWLIST = new Set([
  "@scarf/scarf",
  "fsevents",
  "msgpackr-extract",
  "protobufjs",
  "sharp",
]);

const LIFECYCLE_SCRIPTS = [
  "preinstall", "install", "postinstall",
  "preprepare", "prepare", "postprepare",
  "prepublish", "prepack", "postpack",
];

// The wallet is split so this file does not match its own indicator.
const WALLET_IOC = ["a322e5f3d311d308", "0e6f0121063e9adc2490ef1a"].join("");

const INDICATORS = [
  { rule: "ioc-marker", re: /global\[\s*['"]!['"]\s*\]/, why: "EtherHiding loader marker" },
  { rule: "ioc-wallet", re: new RegExp(WALLET_IOC, "i"), why: "known malware wallet address" },
  {
    rule: "ioc-ethereum-rpc",
    re: /1rpc\.io|eth\.drpc\.org|ethereum-rpc\.publicnode\.com|eth-mainnet\.public\.blastapi\.io|eth\.blockscout\.com/i,
    why: "Ethereum endpoint used for C2 lookup; this backend has no Ethereum integration",
  },
  { rule: "ioc-c2-path", re: /\/0x\/c?ls\b/, why: "known malware download path" },
];

const OBFUSCATION = [
  { rule: "obfuscated-identifier", re: /\b_0x[0-9a-f]{3,}/i, why: "obfuscator-style identifier" },
  { rule: "obfuscated-string", re: /(?:\\u00[0-9a-f]{2}){3,}|(?:\\x[0-9a-f]{2}){4,}/i, why: "ASCII text hidden in escape sequences" },
  { rule: "obfuscated-number", re: /\b\d{4,}\s*\^\s*\d{4,}\b/, why: "constant hidden behind XOR arithmetic" },
];

const DYNAMIC_EXECUTION = [
  { rule: "dynamic-eval", re: /(?<![.\w$])eval\s*\(/, why: "runs a string as code" },
  { rule: "dynamic-function", re: /\bnew\s+Function\s*\(/, why: "runs a string as code" },
  { rule: "hidden-process", re: /\bdetached\s*:\s*true\b[^\n]*\bwindowsHide\b|\bwindowsHide\b[^\n]*\bdetached\s*:\s*true\b/, why: "hidden detached process" },
];

const CHILD_PROCESS_IMPORT = /(?:require\s*\(\s*|from\s+|import\s*\(\s*)['"`](?:node:)?child_process['"`]/;

const INVISIBLE_UNICODE =
  /[\u{202A}-\u{202E}\u{2066}-\u{2069}]|[\u{200B}-\u{200D}\u{2060}\u{FEFF}\u{FE00}-\u{FE0F}]{3,}|[\u{E0000}-\u{E01EF}]|[\u{E000}-\u{F8FF}]/u;

const DATA_URI = /data:[a-z0-9.+/-]+;base64,[a-z0-9+/=]+/gi;

const AUTORUN_FOLDER = /(^|\/)\.vscode\/|(^|\/)\.devcontainer\//;

function git(args, options = {}) {
  const result = spawnSync("git", args, { maxBuffer: MAX_GIT_OUTPUT_BYTES, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

function splitNul(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function readBlobs(entries) {
  if (entries.length === 0) return [];

  const input = entries.map((entry) => entry.sha).join("\n") + "\n";
  const sizes = git(["cat-file", "--batch-check=%(objectsize)"], { input })
    .toString("utf8")
    .trim()
    .split("\n")
    .map(Number);

  const small = [];
  const files = [];
  entries.forEach((entry, index) => {
    if (sizes[index] > MAX_FILE_BYTES) files.push({ path: entry.path, oversized: true });
    else small.push(entry);
  });
  if (small.length === 0) return files;

  const output = git(["cat-file", "--batch"], {
    input: small.map((entry) => entry.sha).join("\n") + "\n",
  });

  let offset = 0;
  for (const entry of small) {
    const headerEnd = output.indexOf(10, offset);
    const size = Number(output.toString("utf8", offset, headerEnd).split(" ")[2]);
    const start = headerEnd + 1;
    files.push({ path: entry.path, content: output.subarray(start, start + size) });
    offset = start + size + 1;
  }
  return files;
}

function isBlob(mode) {
  return mode === "100644" || mode === "100755";
}

function filesFromRef(rev) {
  if (rev.startsWith("-")) throw new Error(`invalid revision: ${rev}`);
  const commit = git(["rev-parse", "--verify", `${rev}^{commit}`]).toString("utf8").trim();
  const entries = splitNul(git(["ls-tree", "-r", "-z", commit])).flatMap((line) => {
    const tab = line.indexOf("\t");
    const [mode, , sha] = line.slice(0, tab).split(" ");
    return isBlob(mode) ? [{ path: line.slice(tab + 1), sha }] : [];
  });
  return readBlobs(entries);
}

function filesFromIndex() {
  const changed = new Set(
    splitNul(git(["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z"])),
  );
  const entries = splitNul(git(["ls-files", "--stage", "-z"])).flatMap((line) => {
    const tab = line.indexOf("\t");
    const [mode, sha] = line.slice(0, tab).split(" ");
    const filePath = line.slice(tab + 1);
    return changed.has(filePath) && isBlob(mode) ? [{ path: filePath, sha }] : [];
  });
  return readBlobs(entries);
}

function filesFromWorkingTree() {
  const root = git(["rev-parse", "--show-toplevel"]).toString("utf8").trim();
  return splitNul(git(["ls-files", "-z"], { cwd: root })).flatMap((filePath) => {
    const absolute = path.join(root, filePath);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch {
      return [];
    }
    if (!stat.isFile()) return [];
    if (stat.size > MAX_FILE_BYTES) return [{ path: filePath, oversized: true }];
    return [{ path: filePath, content: fs.readFileSync(absolute) }];
  });
}

function isBinary(buffer) {
  return buffer.subarray(0, 8192).includes(0);
}

function hasCodeShebang(text) {
  return /^#!.*\b(?:sh|bash|zsh|node|python\d?)\b/.test(text);
}

function scanLines(filePath, text, { isCode, isJs, isData }) {
  const violations = [];
  const add = (line, rule, why) => violations.push({ path: filePath, line, rule, why });
  const checkLongLines = (isCode || isData) && !LONG_LINE_ALLOWLIST.has(filePath);
  const isMarkdown = path.extname(filePath).toLowerCase() === ".md";

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;

    if (!isMarkdown) {
      for (const { rule, re, why } of INDICATORS) {
        if (re.test(rawLine)) add(line, rule, why);
      }
    }

    if (checkLongLines) {
      const content = isData ? rawLine.replace(DATA_URI, "data:") : rawLine;
      if (content.length > MAX_LINE_LENGTH) {
        add(line, "long-line", `${content.length} characters; limit is ${MAX_LINE_LENGTH}`);
      }
      const run = new RegExp(`\\S[ \\t]{${MAX_WHITESPACE_RUN},}\\S`);
      if (run.test(content)) {
        add(line, "hidden-whitespace", "code pushed off-screen by a long whitespace run");
      }
    }

    if (isCode) {
      if (INVISIBLE_UNICODE.test(rawLine)) add(line, "invisible-unicode", "invisible or bidi characters");
      for (const { rule, re, why } of OBFUSCATION) {
        if (re.test(rawLine)) add(line, rule, why);
      }
    }

    if (isJs) {
      for (const { rule, re, why } of DYNAMIC_EXECUTION) {
        if (re.test(rawLine)) add(line, rule, why);
      }
      if (CHILD_PROCESS_IMPORT.test(rawLine) && !CHILD_PROCESS_ALLOWLIST.has(filePath)) {
        add(line, "child-process", "new use of child processes needs review and an allowlist entry");
      }
    }
  });

  return violations;
}

function isNonRegistrySpec(spec) {
  return typeof spec === "string" && /^(?:git(?:\+|:)|github:|gitlab:|bitbucket:|https?:|file:|[\w.-]+\/[\w.-]+(?:#|$))/i.test(spec);
}

function scanPackageJson(filePath, text) {
  const violations = [];
  const add = (rule, why) => violations.push({ path: filePath, line: 1, rule, why });

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    add("invalid-manifest", "package.json is not valid JSON");
    return violations;
  }

  for (const name of LIFECYCLE_SCRIPTS) {
    if (manifest.scripts && manifest.scripts[name] !== undefined) {
      add("lifecycle-script", `"${name}" script runs automatically during npm install or publish`);
    }
  }

  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, spec] of Object.entries(manifest[field] || {})) {
      if (isNonRegistrySpec(spec)) add("non-registry-dependency", `${name} installs from "${spec}"`);
    }
  }
  return violations;
}

function scanLockfile(filePath, text) {
  const violations = [];
  const add = (rule, why) => violations.push({ path: filePath, line: 1, rule, why });

  let lock;
  try {
    lock = JSON.parse(text);
  } catch {
    add("invalid-lockfile", "package-lock.json is not valid JSON");
    return violations;
  }

  for (const [location, entry] of Object.entries(lock.packages || {})) {
    if (!location) continue;
    const name = entry.name || location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length);

    if (entry.resolved && !entry.link && !entry.resolved.startsWith("https://registry.npmjs.org/")) {
      add("non-registry-lockfile", `${name} resolves to ${entry.resolved}`);
    }
    if (entry.hasInstallScript && !INSTALL_SCRIPT_ALLOWLIST.has(name)) {
      add("new-install-script", `${name}@${entry.version} runs a script during npm install`);
    }
  }
  return violations;
}

function scanAutorunConfig(filePath, text) {
  if (!AUTORUN_FOLDER.test(filePath)) return [];
  if (/"runOn"\s*:\s*"folderOpen"/.test(text)) {
    return [{ path: filePath, line: 1, rule: "editor-autorun", why: "task runs automatically when the folder is opened" }];
  }
  return [];
}

function scanFile(file) {
  const extension = path.extname(file.path).toLowerCase();

  if (file.oversized) {
    const suspicious = CODE_EXTENSIONS.has(extension);
    return suspicious
      ? [{ path: file.path, line: 1, rule: "oversized-code", why: `code file over ${MAX_FILE_BYTES} bytes` }]
      : [];
  }
  if (isBinary(file.content)) return [];

  const text = file.content.toString("utf8");
  const baseName = path.basename(file.path);
  const isJs = JS_EXTENSIONS.has(extension);
  const isCode = CODE_EXTENSIONS.has(extension) || hasCodeShebang(text);
  const isData = DATA_EXTENSIONS.has(extension);

  const violations = scanLines(file.path, text, { isCode, isJs, isData });
  if (baseName === "package.json") violations.push(...scanPackageJson(file.path, text));
  if (baseName === "package-lock.json") violations.push(...scanLockfile(file.path, text));
  violations.push(...scanAutorunConfig(file.path, text));
  return violations;
}

function loadFiles(argv) {
  const [mode, value] = argv;
  if (mode === "--all") return filesFromWorkingTree();
  if (mode === "--staged") return filesFromIndex();
  if (mode === "--ref" && value) return filesFromRef(value);
  throw new Error("usage: scanRepo.js --all | --staged | --ref <rev>");
}

function main() {
  const files = loadFiles(process.argv.slice(2));
  const violations = files.flatMap(scanFile);

  if (violations.length === 0) {
    console.log(`security scan: ${files.length} files checked, no violations.`);
    return 0;
  }

  console.error(`\nsecurity scan BLOCKED: ${violations.length} violation(s)\n`);
  for (const { path: filePath, line, rule, why } of violations) {
    console.error(`  ${filePath}:${line}  [${rule}]  ${why}`);
  }
  console.error("\nDo not run or require these files. See scripts/security/README.md.\n");
  return 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`security scan ERROR: ${error.message}`);
  process.exitCode = 2;
}
