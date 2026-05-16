import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 注意：不要启用 output: "standalone"
  // 因为我们用 better-sqlite3 + data/ SQLite 文件走 process.cwd()，
  // standalone 模式会改变工作目录导致 DB 找不到。
};

export default nextConfig;
