import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 部署只传 .next/standalone：服务器不装依赖、不构建
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
