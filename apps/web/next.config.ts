import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@mikrotik/types", "@mikrotik/ui"],
  experimental: {
    // Enable React 19 features
    reactCompiler: false,
  },
};

export default nextConfig;
