import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer implicitly loads .env for the CLI.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional — real deployments inject environment variables directly.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Migrations run over the direct connection, never the pooler. Neon's
    // pooled endpoint is pgbouncer in transaction mode, which silently drops
    // the session state that DDL and Prisma's migration advisory lock depend
    // on; the failure surfaces later as a half-applied migration rather than
    // an error here. The application itself still uses the pooled
    // DATABASE_URL. Falls back when unset, so a plain local Postgres, which
    // has no separate endpoints, needs no extra configuration.
    url: process.env.DIRECT_DATABASE_URL || env("DATABASE_URL"),
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
