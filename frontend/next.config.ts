import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "h264-mp4-encoder": "h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "h264-mp4-encoder": path.join(
        __dirname,
        "node_modules/h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js",
      ),
    };
    return config;
  },
};

export default nextConfig;
