import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ws"],
  outputFileTracingRoot: path.join(__dirname),
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
