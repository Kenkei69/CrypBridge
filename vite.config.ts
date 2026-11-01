import { privateFileDeny } from "./dev-file-policy.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
const hosts = [
  process.env.REPLIT_DEV_DOMAIN,
  ...(process.env.REPLIT_DOMAINS || "").split(","),
].filter((v): v is string => Boolean(v));
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    fs: { deny: privateFileDeny },
    strictPort: false,
    port: Number(process.env.VITE_PORT) || 5173,
    host: "0.0.0.0",
    allowedHosts: hosts.length > 0 ? hosts : true,
    watch: {
      ignored: [
        "**/.local/**",
        "**/.cache/**",
        "**/.codex-private/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/server/**",
        "**/prisma/**",
      ],
    },
    proxy: {
      "/api": process.env.API_PROXY_TARGET || "http://127.0.0.1:3001",
      "/merchant": process.env.API_PROXY_TARGET || "http://127.0.0.1:3001",
      "/mock": "http://127.0.0.1:3001",
      "/ws": { target: "ws://127.0.0.1:3001", ws: true },
    },
  },
});
