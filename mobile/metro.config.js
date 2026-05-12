const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const path = require('path');
const workspaceRoot = path.resolve(__dirname, '..');

const config = getDefaultConfig(__dirname);

// Watch the parent directory so Metro can compile src/lib/api.ts
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Intercept import of './supabase' inside api.ts to return the Mobile supabase client
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './supabase' && context.originModulePath.includes('src/lib/api.ts')) {
    return {
      filePath: path.resolve(__dirname, 'lib/supabase.ts'),
      type: 'sourceFile',
    };
  }
  // Let Metro handle everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
