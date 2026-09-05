import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what the Docker image copies. Vercel does its own bundling.
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["pg", "pg-boss", "nodemailer", "googleapis"],
};

export default nextConfig;
