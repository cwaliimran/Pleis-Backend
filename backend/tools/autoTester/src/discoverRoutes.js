
const fs = require("fs");
const path = require("path");

function safeExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Recursively parse router.use() calls from route files.
 * Handles both file and directory imports.
 */
function parseRouterFile(filePath, basePath = "") {
  if (!safeExists(filePath)) {
    console.warn("⚠️  Missing file:", filePath);
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const routerDir = path.dirname(filePath);
  const routes = [];

  const regex = /router\.use\s*\(\s*["'`](.*?)["'`]\s*,\s*require\s*\(\s*["'`](.*?)["'`]\s*\)\s*\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const subPath = match[1];
    const relativeTarget = match[2];
    let resolvedPath = path.resolve(routerDir, relativeTarget);

    // Try .js and /index.js fallback
    let targetFile = null;
    if (safeExists(resolvedPath + ".js")) {
      targetFile = resolvedPath + ".js";
    } else if (safeExists(path.join(resolvedPath, "index.js"))) {
      targetFile = path.join(resolvedPath, "index.js");
    } else {
      console.warn("⚠️  Skipping invalid import:", relativeTarget, "(from", filePath + ")");
      continue;
    }

    const routeBase = basePath + subPath;
    routes.push({ base: routeBase, file: targetFile });

    // Recurse into nested routers
    routes.push(...parseRouterFile(targetFile, routeBase));
  }

  return routes;
}

module.exports = { parseRouterFile };
