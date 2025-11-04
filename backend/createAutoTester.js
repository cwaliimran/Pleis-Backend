/**
 * createAutoTester.js
 * --------------------------------------------
 * Rebuilds the full autoTester tool — no chalk dependency,
 * clean console output, skips missing files safely.
 */

const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const testerRoot = path.join(rootDir, "tools/autoTester");
const srcDir = path.join(testerRoot, "src");
const outputDir = path.join(testerRoot, "output");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(srcDir);
ensureDir(outputDir);

// -------------------- package.json --------------------
const packageJson = {
  name: "pleis-auto-tester",
  version: "1.0.2",
  description: "Automated route discovery and API testing for Pleis Backend",
  main: "src/index.js",
  scripts: {
    discover: "node src/index.js"
  },
  dependencies: {
    express: "^4.19.0",
    mongoose: "^7.8.1"
  }
};
fs.writeFileSync(path.join(testerRoot, "package.json"), JSON.stringify(packageJson, null, 2));

// -------------------- discoverRoutes.js --------------------
fs.writeFileSync(
  path.join(srcDir, "discoverRoutes.js"),
  `
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

  const regex = /router\\.use\\s*\\(\\s*["'\`](.*?)["'\`]\\s*,\\s*require\\s*\\(\\s*["'\`](.*?)["'\`]\\s*\\)\\s*\\)/g;
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
`
);

// -------------------- extractEndpoints.js --------------------
fs.writeFileSync(
  path.join(srcDir, "extractEndpoints.js"),
  `
const fs = require("fs");

/**
 * Extracts all router.get/post/etc. definitions.
 * Safely skips unreadable or missing files.
 */
function extractRouteHandlers(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn("⚠️  Missing route file:", filePath);
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const handlers = [];
    const regex =
      /router\\.(get|post|put|patch|delete)\\s*\\(\\s*["'\`](.*?)["'\`]\\s*,\\s*([A-Za-z0-9_.]+)/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      handlers.push({
        method: match[1].toUpperCase(),
        subRoute: match[2],
        handler: match[3],
      });
    }
    return handlers;
  } catch (err) {
    console.warn("⚠️  Failed to parse", filePath, ":", err.message);
    return [];
  }
}

module.exports = { extractRouteHandlers };
`
);

// -------------------- linkControllersAndModels.js --------------------
fs.writeFileSync(
  path.join(srcDir, "linkControllersAndModels.js"),
  `
const fs = require("fs");
const path = require("path");

function findControllerFile(routeFile, handlerName) {
  if (!fs.existsSync(routeFile)) return null;

  const content = fs.readFileSync(routeFile, "utf-8");
  const variable = handlerName.split(".")[0];
  const regex = new RegExp(\`const\\\\s+\${variable}\\\\s*=\\\\s*require\\\\(["'\`](.*?)["'\`]\\\\)\`);
  const match = regex.exec(content);

  if (!match) return null;
  return path.resolve(path.dirname(routeFile), match[1] + ".js");
}

function findModels(controllerFile) {
  if (!controllerFile || !fs.existsSync(controllerFile)) return [];
  const content = fs.readFileSync(controllerFile, "utf-8");
  const modelRegex = /mongoose\\.model\\(["'\`](.*?)["'\`]/g;
  const found = [];
  let match;
  while ((match = modelRegex.exec(content)) !== null) {
    found.push(match[1]);
  }
  return found;
}

module.exports = { findControllerFile, findModels };
`
);

// -------------------- index.js --------------------
fs.writeFileSync(
  path.join(srcDir, "index.js"),
  `
const fs = require("fs");
const path = require("path");
const { parseRouterFile } = require("./discoverRoutes");
const { extractRouteHandlers } = require("./extractEndpoints");
const { findControllerFile, findModels } = require("./linkControllersAndModels");

(async () => {
  const root = "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend";
  const mainRouter = path.join(root, "routes/index.js");

  console.log("🔍 Scanning routes starting from:", mainRouter);
  const allRoutes = parseRouterFile(mainRouter, "/api/v1");

  const enriched = [];

  for (const route of allRoutes) {
    const endpoints = extractRouteHandlers(route.file);
    const detailedEndpoints = endpoints.map(e => ({
      ...e,
      fullPath: route.base + e.subRoute,
      controller: findControllerFile(route.file, e.handler),
    }));
    enriched.push({ ...route, endpoints: detailedEndpoints });
  }

  const outPath = path.join(__dirname, "../output/routesMap.json");
  fs.writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  console.log("✅ Routes map generated successfully at:", outPath);
})();
`
);

// -------------------- README.md --------------------
fs.writeFileSync(
  path.join(testerRoot, "README.md"),
  `# Pleis Auto Tester (No Chalk Version)

### ✅ Features
- Safely scans nested routes using \`router.use()\`
- Automatically skips invalid/missing files
- Handles both \`file.js\` and \`/folder/index.js\` imports
- Logs to console (no dependencies)
- Outputs \`output/routesMap.json\` for testing

### 🧠 Usage
\`\`\`bash
cd backend
node createAutoTester.js
cd tools/autoTester
npm install
npm run discover
\`\`\`
`
);

console.log("✅ AutoTester tool created successfully (no chalk, safe skipping).");
