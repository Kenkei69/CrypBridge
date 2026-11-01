import { privateFileDeny } from "./dev-file-policy.ts";
import { defineConfig } from "vitest/config";
export default defineConfig({
  server: { fs: { deny: privateFileDeny } },
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    include: ["tests/testnet*.test.ts", "tests/lab*.test.ts"],
    fileParallelism: false,
    env: { NODE_ENV: "test", DEMO_MODE: "true" },
  },
});
