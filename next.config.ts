import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin file tracing to this checkout so builds in each git worktree don't pick up an outer lockfile.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
