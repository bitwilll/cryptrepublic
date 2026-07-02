import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Deployment wiring guard (Vercel hosting wave).
 *
 * The local suite runs against SQLite; production (Vercel) runs against
 * Postgres via prisma/postgres/schema.prisma. These assertions pin the
 * package.json wiring so the two worlds cannot silently drift:
 * - db:generate:pg / db:migrate:pg:deploy must point at the postgres schema;
 * - the postgres migrations directory must exist with a postgresql lock file.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

const PG_SCHEMA = "prisma/postgres/schema.prisma";

describe("postgres deployment scripts (package.json)", () => {
  it("db:generate:pg generates the client from the postgres schema", () => {
    expect(pkg.scripts["db:generate:pg"]).toBe(`prisma generate --schema ${PG_SCHEMA}`);
  });

  it("db:migrate:pg:deploy runs migrate deploy against the postgres schema", () => {
    expect(pkg.scripts["db:migrate:pg:deploy"]).toBe(`prisma migrate deploy --schema ${PG_SCHEMA}`);
  });

  it("db:seed stays dialect-neutral (plain tsx entrypoint, no sqlite-only flags)", () => {
    expect(pkg.scripts["db:seed"]).toBe("tsx prisma/seed.ts");
  });

  it("postgres migrations lock file pins provider = postgresql", () => {
    const lock = readFileSync(join(root, "prisma/postgres/migrations/migration_lock.toml"), "utf8");
    expect(lock).toContain('provider = "postgresql"');
  });

  it("an init migration exists and is postgres-dialect SQL", () => {
    const sql = readFileSync(
      join(root, "prisma/postgres/migrations/20260702000000_init_postgres/migration.sql"),
      "utf8",
    );
    // Spot-check the dialect mapping (sqlite would say DATETIME / no TIMESTAMP).
    expect(sql).toContain('"valueUsd" BIGINT NOT NULL');
    expect(sql).toContain("TIMESTAMP(3)");
    expect(sql).toContain('"lat" DOUBLE PRECISION NOT NULL');
    expect(sql).not.toContain("DATETIME");
    // Every model in the schema has a CREATE TABLE.
    const schema = readFileSync(join(root, PG_SCHEMA), "utf8");
    const models = [...schema.matchAll(/^model\s+(\w+)\s/gm)].map((m) => m[1]);
    expect(models.length).toBeGreaterThanOrEqual(10);
    for (const model of models) {
      expect(sql, `missing CREATE TABLE for model ${model}`).toContain(`CREATE TABLE "${model}"`);
    }
  });
});
