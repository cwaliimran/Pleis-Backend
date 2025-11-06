// aliasConfig/update-aliases.js
const fs = require("fs");
const path = require("path");

const aliases = require("./pathAliases.config.js"); // same folder now

const packageJsonPath = path.resolve(__dirname, "../package.json");
const jsConfigPath = path.resolve(__dirname, "../jsconfig.json");

// ---- Update package.json ----
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
pkg._moduleAliases = aliases;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

// ---- Update jsconfig.json ----
const jsConfig = fs.existsSync(jsConfigPath)
  ? JSON.parse(fs.readFileSync(jsConfigPath, "utf8"))
  : { compilerOptions: { baseUrl: "./", paths: {} } };

jsConfig.compilerOptions = jsConfig.compilerOptions || {};
jsConfig.compilerOptions.baseUrl = "./";
jsConfig.compilerOptions.paths = jsConfig.compilerOptions.paths || {};

Object.entries(aliases).forEach(([alias, target]) => {
  jsConfig.compilerOptions.paths[`${alias}/*`] = [`${target}/*`];
});

jsConfig.exclude = ["node_modules"];

fs.writeFileSync(jsConfigPath, JSON.stringify(jsConfig, null, 2));

console.log("✅ Aliases synced to package.json and jsconfig.json");
