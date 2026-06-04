// Metro for a pnpm monorepo: watch the workspace root and resolve from both the
// app's and the root's node_modules. With node-linker=hoisted (.npmrc) the RN/Expo
// deps live at the workspace root, so nodeModulesPaths must include it.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
