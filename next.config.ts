import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PrintFlow is an authenticated, per-request operational app. Every screen
  // reads live data behind a session, so Cache Components / static shells add
  // little value today. Revisit when Next.js makes it the default.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/**" },
    ],
  },
};

export default nextConfig;
