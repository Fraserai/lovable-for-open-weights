import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runs used to open at /runs/<id>; they now live on the Train page's Current Run tab
  async redirects() {
    return [{ source: "/runs/:id", destination: "/?tab=run&run=:id", permanent: false }];
  },
};

export default nextConfig;
