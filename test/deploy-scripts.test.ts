import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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
  });

  it("every model has a CREATE TABLE across the postgres migration history", () => {
    // The init migration is the wave-9 snapshot; MODELS ADDED LATER (e.g. the
    // Wave-12 Referral table) live in a NEW incremental migration that
    // `migrate deploy` applies to the existing prod DB. So the guard scans the
    // UNION of every postgres migration — never just init — otherwise a new
    // table would have to double-create (init + incremental) to satisfy it.
    const migrationsDir = join(root, "prisma/postgres/migrations");
    const allSql = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => readFileSync(join(migrationsDir, d.name, "migration.sql"), "utf8"))
      .join("\n");
    const schema = readFileSync(join(root, PG_SCHEMA), "utf8");
    const models = [...schema.matchAll(/^model\s+(\w+)\s/gm)].map((m) => m[1]);
    expect(models.length).toBeGreaterThanOrEqual(10);
    for (const model of models) {
      expect(allSql, `no postgres migration CREATE TABLEs model ${model}`).toContain(
        `CREATE TABLE "${model}"`,
      );
    }
  });
});

describe("vercel-build (Vercel runs this instead of `build` when present)", () => {
  it("generates the POSTGRES client, deploys migrations, then builds — in that order", () => {
    const script = pkg.scripts["vercel-build"];
    expect(script, "package.json must define a vercel-build script").toBeTruthy();

    const generateIdx = script.indexOf(`prisma generate --schema ${PG_SCHEMA}`);
    const migrateIdx = script.indexOf(`prisma migrate deploy --schema ${PG_SCHEMA}`);
    const buildIdx = script.indexOf("next build");

    expect(
      generateIdx,
      "vercel-build must generate the client from the postgres schema",
    ).toBeGreaterThanOrEqual(0);
    expect(
      migrateIdx,
      "vercel-build must run migrate deploy against the postgres schema",
    ).toBeGreaterThan(generateIdx);
    expect(buildIdx, "next build must run AFTER generate + migrate deploy").toBeGreaterThan(
      migrateIdx,
    );
  });

  it("never references the sqlite dev schema or sqlite-only commands", () => {
    const script = pkg.scripts["vercel-build"];
    expect(script).not.toContain("migrate dev");
    expect(script).not.toContain("--schema prisma/schema.prisma");
  });
});
