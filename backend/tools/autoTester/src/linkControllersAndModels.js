const fs = require("fs");
const path = require("path");

function findControllerFile(routeFile, handlerName) {
  if (!handlerName || !routeFile) return null;

  try {
    const content = fs
      .readFileSync(routeFile, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

    // Destructured imports
    const destructured = /const\s*{\s*([^}]+)\s*}\s*=\s*require\(["'`](.*?)["'`]\)/g;
    let m;
    while ((m = destructured.exec(content))) {
      const vars = m[1].split(",").map((v) => v.trim());
      if (vars.includes(handlerName)) {
        return resolveControllerPath(routeFile, m[2]);
      }
    }

    // Direct variable imports
    const direct = new RegExp(
      `const\\s+[A-Za-z0-9_]+\\s*=\\s*require\\(["'\`](.*?)["'\`]\\)`
    );
    m = direct.exec(content);
    if (m) return resolveControllerPath(routeFile, m[1]);

    // ES module imports
    const importMatch = /import\s+.*?from\s+["'`](.*?)["'`]/.exec(content);
    if (importMatch) return resolveControllerPath(routeFile, importMatch[1]);

    return null;
  } catch {
    return null;
  }
}

function resolveControllerPath(baseFile, relativePath) {
  if (!relativePath) return null;
  if (relativePath.endsWith("/")) return null;
  const abs = path.resolve(path.dirname(baseFile), relativePath);
  const candidates = [abs, abs + ".js", path.join(abs, "index.js")];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

module.exports = { findControllerFile };
