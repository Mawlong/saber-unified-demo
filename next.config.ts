import type { NextConfig } from "next";

/*
  Prototype config. Also set up for static export so it can be hosted on GitHub Pages.
  - `output: "export"` writes a static site to ./out (no server needed).
  - `images.unoptimized` is required for static export.
  - basePath / assetPrefix come from BASE_PATH so the site works under a repo subpath
    (e.g. https://<user>.github.io/<repo>). The deploy workflow sets BASE_PATH=/<repo>.
    Locally BASE_PATH is empty, so `npm run dev` works at http://localhost:3000.
*/
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
};

export default nextConfig;
