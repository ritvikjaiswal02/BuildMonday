import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.resolve(__dirname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      // "server-only" throws outside React Server Components; tests run server
      // modules directly, so use the package's own empty module.
      { find: /^server-only$/, replacement: path.join(root, "node_modules/server-only/empty.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "extension/**"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    server: {
      deps: {
        // next-auth ships ESM that imports "next/server" without an extension;
        // Next 14 has no exports map, so let Vite resolve it instead of Node.
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});
