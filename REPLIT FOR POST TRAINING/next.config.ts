import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // TEMPORARY: the default `.next` cache had 121 files lose their contents in
  // the 2026-08-20 disk incident, which made `next dev` exit silently at
  // startup. Building into a fresh directory sidesteps it without deleting
  // anything. Once `.next` has been removed (`rm -rf .next`, it is a pure
  // build cache and safe to delete), drop this line to go back to the default.
  distDir: ".next-build",

  turbopack: {
    // Pin the workspace root to this project. Without it Next walks up and
    // finds a stray package-lock.json in the home directory, infers the root
    // is ~, and tries to watch the entire home folder.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
