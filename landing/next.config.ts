import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is intentionally standalone (its own pnpm-workspace.yaml). Pin the Turbopack
  // root here so Next doesn't walk up and infer the parent PharmaBro monorepo as the root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
