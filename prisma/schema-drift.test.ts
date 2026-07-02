import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * DUAL-SCHEMA DRIFT GUARD (Vercel hosting wave).
 *
 * prisma/schema.prisma (sqlite) is AUTHORITATIVE for local dev + the whole
 * local test suite. prisma/postgres/schema.prisma (postgresql) is the Vercel
 * production deployment target. The generated Prisma client comes from
 * whichever schema `prisma generate` last ran — on Vercel that is the postgres
 * schema, locally the sqlite one — so the two files MUST define an IDENTICAL
 * datamodel or the client API silently diverges between environments.
 *
 * This test parses BOTH schema files and asserts the model / field /
 * attribute sets are identical (datasource blocks intentionally differ:
 * provider + the postgres-only directUrl). Any schema edit that touches only
 * one file fails here.
 */

const prismaDir = dirname(fileURLToPath(import.meta.url));
const SQLITE_SCHEMA = join(prismaDir, "schema.prisma");
const POSTGRES_SCHEMA = join(prismaDir, "postgres", "schema.prisma");

/** Strip `//` line comments (the schema has no strings containing `//`). */
function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function normalizeWs(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

interface BlockShape {
  /** field name -> normalized field definition (type + attributes) */
  fields: Map<string, string>;
  /** sorted, normalized block-level attributes (@@index, @@unique, …) */
  blockAttrs: string[];
}

/** Parse `model X { … }` and `enum X { … }` blocks into comparable shapes. */
function parseBlocks(src: string, kind: "model" | "enum"): Map<string, BlockShape> {
  const stripped = stripComments(src);
  const blocks = new Map<string, BlockShape>();
  const re = new RegExp(`${kind}\\s+(\\w+)\\s*\\{([^}]*)\\}`, "g");
  for (const match of stripped.matchAll(re)) {
    const [, name, body] = match;
    const fields = new Map<string, string>();
    const blockAttrs: string[] = [];
    for (const rawLine of body.split("\n")) {
      const line = normalizeWs(rawLine);
      if (line === "") continue;
      if (line.startsWith("@@")) {
        blockAttrs.push(line);
        continue;
      }
      const firstSpace = line.indexOf(" ");
      const fieldName = firstSpace === -1 ? line : line.slice(0, firstSpace);
      const rest = firstSpace === -1 ? "" : normalizeWs(line.slice(firstSpace));
      fields.set(fieldName, rest);
    }
    blockAttrs.sort();
    blocks.set(name, { fields, blockAttrs });
  }
  return blocks;
}

function datasourceProvider(src: string): string | undefined {
  const m = stripComments(src).match(/datasource\s+\w+\s*\{([^}]*)\}/);
  return m?.[1].match(/provider\s*=\s*"([^"]+)"/)?.[1];
}

function generatorProviders(src: string): string[] {
  const out: string[] = [];
  for (const m of stripComments(src).matchAll(/generator\s+\w+\s*\{([^}]*)\}/g)) {
    const p = m[1].match(/provider\s*=\s*"([^"]+)"/)?.[1];
    if (p) out.push(p);
  }
  return out.sort();
}

describe("prisma dual-schema drift guard (sqlite <-> postgres)", () => {
  it("prisma/postgres/schema.prisma exists (Vercel production target)", () => {
    expect(
      existsSync(POSTGRES_SCHEMA),
      "prisma/postgres/schema.prisma is missing — the Vercel/Postgres deployment target " +
        "must mirror prisma/schema.prisma (see docs/DEPLOY_VERCEL.md)",
    ).toBe(true);
  });

  it("datasource providers are sqlite (local) and postgresql (deploy) respectively", () => {
    const sqlite = readFileSync(SQLITE_SCHEMA, "utf8");
    const pg = readFileSync(POSTGRES_SCHEMA, "utf8");
    expect(datasourceProvider(sqlite)).toBe("sqlite");
    expect(datasourceProvider(pg)).toBe("postgresql");
  });

  it("generator blocks are identical (same client provider)", () => {
    const sqlite = readFileSync(SQLITE_SCHEMA, "utf8");
    const pg = readFileSync(POSTGRES_SCHEMA, "utf8");
    expect(generatorProviders(pg)).toEqual(generatorProviders(sqlite));
  });

  for (const kind of ["model", "enum"] as const) {
    it(`${kind} blocks are IDENTICAL across both schemas (names, fields, attributes)`, () => {
      const sqlite = parseBlocks(readFileSync(SQLITE_SCHEMA, "utf8"), kind);
      const pg = parseBlocks(readFileSync(POSTGRES_SCHEMA, "utf8"), kind);

      const sqliteNames = [...sqlite.keys()].sort();
      const pgNames = [...pg.keys()].sort();
      expect(pgNames, `${kind} set diverged between the two schemas`).toEqual(sqliteNames);

      for (const name of sqliteNames) {
        const a = sqlite.get(name)!;
        const b = pg.get(name)!;

        const aFieldNames = [...a.fields.keys()].sort();
        const bFieldNames = [...b.fields.keys()].sort();
        expect(bFieldNames, `${kind} ${name}: field set diverged`).toEqual(aFieldNames);

        for (const field of aFieldNames) {
          expect(
            b.fields.get(field),
            `${kind} ${name}.${field}: definition diverged between sqlite and postgres schemas`,
          ).toBe(a.fields.get(field));
        }

        expect(b.blockAttrs, `${kind} ${name}: block attributes (@@…) diverged`).toEqual(
          a.blockAttrs,
        );
      }
    });
  }

  it("the sqlite schema actually contains models (parser sanity check)", () => {
    const sqlite = parseBlocks(readFileSync(SQLITE_SCHEMA, "utf8"), "model");
    expect(sqlite.size).toBeGreaterThanOrEqual(10);
    expect([...sqlite.keys()]).toContain("User");
    // Spot-check the parser reads field definitions correctly.
    expect(sqlite.get("User")!.fields.get("email")).toBe("String? @unique");
  });
});
