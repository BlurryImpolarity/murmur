import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "node:path";

config({ path: ["../.env", ".env"], quiet: true });

const nextConfig: NextConfig = {
    output: "standalone",
    transpilePackages: ["@murmur/db"],
    // extra hosts allowed to use the dev server, e.g. a phone over LAN/tailscale
    allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((origin) => origin.trim()),
    turbopack: {
        root: path.join(__dirname, ".."),
    },
};

export default nextConfig;
