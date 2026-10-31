import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load the same files Next would.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only `migrate`, `push` and `studio` need a database; `generate` does not.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
