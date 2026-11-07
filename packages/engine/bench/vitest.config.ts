import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Benchmark-only config. The normal engine tests never include `bench/`. */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL("..", import.meta.url)),
    environment: "node",
    include: ["bench/**/*.bench.test.ts"],
  },
});
