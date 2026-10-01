import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    // expectTypeOf does nothing at runtime, so the type tests prove nothing
    // unless the run also typechecks them.
    typecheck: {
      enabled: true,
      include: ["tests/types.test.ts"],
      tsconfig: "./tsconfig.test.json",
    },
  },
});
