import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the project root (prevents Next.js picking up lockfiles from parent folders).
  turbopack: { root: process.cwd() },
};

export default nextConfig;
