import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nemesis/shared"],
  // /app was the old PharmaOrb-era shell and no longer exists; the workspace at "/"
  // (→ /sessions) replaced it. Redirect instead of 404 so stale links keep working.
  async redirects() {
    return [
      { source: "/app", destination: "/", permanent: false },
      { source: "/app/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
