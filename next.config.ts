import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    authInterrupts: true,
  },
  // `/od-prototype/` must stay a directory URL so sibling-relative links
  // (wfp-*.html, styles.css) resolve inside public/od-prototype/.
  // Next's default trailing-slash redirect would 308 that path to
  // `/od-prototype` and break those links. Other paths are normalized
  // in src/middleware.ts.
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
