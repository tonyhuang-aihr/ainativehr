import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // 视图测试会载入 tsx。oxc 在 jsx: preserve 下解析不了组件，改由 esbuild 转换。
  oxc: false,
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
});
