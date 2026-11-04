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
  // `/od-prototype` and break those links, so the built-in redirect is
  // replaced with the same rule for every other path.
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/:seg((?!od-prototype/)[^/]+)/",
        destination: "/:seg",
        permanent: true,
      },
      {
        source: "/:first/:rest+/",
        destination: "/:first/:rest+",
        permanent: true,
      },
    ];
  },
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
