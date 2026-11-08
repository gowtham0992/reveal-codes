import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type WebpackConfig = { resolve?: { extensionAlias?: Record<string, string[]> } };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Engine and Verifier ship TypeScript source; Next compiles it.
  transpilePackages: ["@reveal-codes/engine", "@reveal-codes/verifier"],
  outputFileTracingRoot: REPO_ROOT,
  // The fixture provider reads these files at run time (Tier 2).
  outputFileTracingIncludes: { "/api/assistant": ["./fixtures/assistant/**"] },
  webpack(config: WebpackConfig) {
    // The Engine imports "./x.js" specifiers that point at "./x.ts" files.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default nextConfig;
