import type { NextConfig } from "next";

// Lite 版：沒有特殊 rewrite/redirect 需求，維持最簡設定。
// 第六階段若要調整 PWA 相關 headers（例如 manifest/sw.js 的 Cache-Control），會在這裡加。
const nextConfig: NextConfig = {};

export default nextConfig;
