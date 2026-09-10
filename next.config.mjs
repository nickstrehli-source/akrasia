/** @type {import('next').NextConfig} */
const isStaging = process.env.DEPLOY_TARGET === "github-pages";

const nextConfig = {
  reactStrictMode: true,
  // Static export for GitHub Pages staging. Switch DEPLOY_TARGET off for
  // full server-rendered dev/prod (needed once we add DB-backed routes in AKR-4).
  ...(isStaging
    ? {
        output: "export",
        images: { unoptimized: true },
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
