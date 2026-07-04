import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — otherwise Next.js can get confused
  // by unrelated lockfiles higher up in the home directory tree.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
