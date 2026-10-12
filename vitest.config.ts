import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "sim", include: ["packages/sim/test/**/*.test.ts"] } },
      { test: { name: "shell", include: ["packages/shell/test/**/*.test.ts"] } },
      { test: { name: "rooms", include: ["packages/rooms/test/**/*.test.ts"] } },
      { test: { name: "engine", include: ["packages/engine/test/**/*.test.ts"] } },
      { test: { name: "web", include: ["apps/web/test/**/*.test.ts"] } },
      // Real Linux in namespaces, in real time: run with `pnpm difftest`, not `pnpm test`.
      { test: { name: "difftest", include: ["tools/difftest/**/*.test.ts"], fileParallelism: false } },
    ],
  },
});
