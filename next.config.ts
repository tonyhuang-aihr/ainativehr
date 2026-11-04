import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    authInterrupts: true,
  },
  // Keep `/od-prototype/` as a directory URL. Next otherwise 308s it to
  // `/od-prototype`, and the nav page's sibling-relative links would miss
  // `public/od-prototype/`.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/od-prototype/",
          destination: "/od-prototype/index.html",
        },
      ],
    };
  },
};

export default nextConfig;
