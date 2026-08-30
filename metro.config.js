// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure '@/...' alias resolves to src/... even when tsconfig paths are ignored by some tools
// Metro's default resolver already handles tsconfig.json paths with bundler resolution,
// but we add an explicit fallback for environments (e.g., web) where it may be flaky.
const srcPath = path.resolve(__dirname, 'src');
config.resolver = config.resolver || {};
// Keep defaults, only add alias fallback
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const relative = moduleName.slice(2); // strip '@/'
    const candidate = path.join(srcPath, relative);
    try {
      return context.resolveRequest(context, candidate, platform);
    } catch {
      // fall through to default
    }
  }
  if (originalResolveRequest) return originalResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
