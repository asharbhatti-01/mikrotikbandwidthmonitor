import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@mikrotik/types", "@mikrotik/ui"],
  turbopack: {
    root: "/app",
  },
};

export default nextConfig;
