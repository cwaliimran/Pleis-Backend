const fs = require("fs");
const path = require("path");
const { extractEndpoints } = require("./extractEndpoints");

function parseRequirePaths(content, currentDir) {
  const requireRegex = /require\(["'`](.*?)["'`]\)/g;
  const files = [];
  let match;
  while ((match = requireRegex.exec(content))) {
    let reqPath = match[1];
    if (!reqPath.startsWith(".")) continue;
    const resolved = path.resolve(currentDir, reqPath);
    if (fs.existsSync(resolved + ".js")) files.push(resolved + ".js");
    else if (fs.existsSync(resolved + "/index.js")) files.push(resolved + "/index.js");
    else if (fs.existsSync(resolved)) {
      if (fs.statSync(resolved).isFile()) files.push(resolved);
    }
  }
  return files;
}

async function parseRoutesRecursively(entryFile, basePath = "") {
  if (!fs.existsSync(entryFile)) return [];
  const visited = new Set();
  const results = [];

  function traverse(filePath, prefix) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      console.warn("⚠️ Skipping unreadable file:", filePath);
      return;
    }

    // Find route-level uses like router.use("/auth", require("./authRoutes"))
    const useRegex = /router\.use\s*\(\s*["'`](.*?)["'`]\s*,\s*require\(["'`](.*?)["'`]\)\s*\)/g;
    let match;
    while ((match = useRegex.exec(content))) {
      const sub = match[1];
      const rel = match[2];
      const subPath = path.resolve(path.dirname(filePath), rel);
      const newBase = `${prefix}${sub}`.replace(/\/+/g, "/");
      const subFile = fs.existsSync(subPath + ".js")
        ? subPath + ".js"
        : fs.existsSync(subPath + "/index.js")
        ? subPath + "/index.js"
        : null;

      if (subFile) traverse(subFile, newBase);
    }

    // Extract endpoints from this router
    const endpoints = extractEndpoints(content, prefix);
    if (endpoints.length > 0) {
      results.push({
        base: prefix,
        file: filePath,
        endpoints,
      });
    }

    // Recurse into additional requires (nested routers)
    const requirePaths = parseRequirePaths(content, path.dirname(filePath));
    for (const rp of requirePaths) {
      if (!visited.has(rp) && rp.includes("Routes")) {
        traverse(rp, prefix);
      }
    }
  }

  traverse(entryFile, basePath);
  return results;
}

module.exports = { parseRoutesRecursively };
