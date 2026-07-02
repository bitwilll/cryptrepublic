// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  toCsv,
  USERS_EXPORT_COLUMNS,
  APPLICATIONS_EXPORT_COLUMNS,
  AUDIT_EXPORT_COLUMNS,
  type CsvColumn,
} from "./csv";

describe("toCsv — header + rows", () => {
  it("emits a header row from columns[].header and one row per record, \\r\\n terminated", () => {
    const cols: CsvColumn<{ a: number; b: string }>[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];
    expect(toCsv([{ a: 1, b: "x" }], cols)).toBe("A,B\r\n1,x\r\n");
  });

  it("emits ONLY the header row for an empty row set", () => {
    const cols: CsvColumn<{ a: number }>[] = [{ key: "a", header: "A" }];
    expect(toCsv([], cols)).toBe("A\r\n");
  });
});

describe("toCsv — formula-injection safety (OWASP)", () => {
  const cols: CsvColumn<{ v: string }>[] = [{ key: "v", header: "V" }];
  const cell = (v: string) => toCsv([{ v }], cols).split("\r\n")[1];

  it("prefixes a leading = + - @ with an apostrophe AND quotes the cell", () => {
    expect(cell("=1+2")).toBe(`"'=1+2"`);
    expect(cell("+1")).toBe(`"'+1"`);
    expect(cell("-1")).toBe(`"'-1"`);
    expect(cell("@x")).toBe(`"'@x"`);
  });

  it("neutralizes a leading TAB or CR the same way", () => {
    expect(cell("\tcmd")).toBe(`"'\tcmd"`);
    expect(cell("\rcmd")).toBe(`"'\rcmd"`);
  });

  it("leaves a benign leading char untouched (no apostrophe, no needless quote)", () => {
    expect(cell("hello")).toBe("hello");
    expect(cell("1abc")).toBe("1abc");
  });
});

describe("toCsv — quoting + escaping", () => {
  const cols: CsvColumn<{ v: string }>[] = [{ key: "v", header: "V" }];
  const cell = (v: string) => toCsv([{ v }], cols).split("\r\n")[1];

  it("quotes a value containing a comma", () => {
    expect(cell("a,b")).toBe(`"a,b"`);
  });

  it("quotes a value with a newline or CR", () => {
    expect(cell("a\nb")).toBe(`"a\nb"`);
    expect(cell("a\rb")).toBe(`"a\rb"`);
  });

  it("quotes and doubles an embedded double-quote", () => {
    expect(cell('a"b')).toBe(`"a""b"`);
  });
});

describe("toCsv — value coercion", () => {
  it("bigint → decimal string, Date → ISO, boolean/number → String, null/undefined → empty", () => {
    interface R {
      big: bigint;
      when: Date;
      flag: boolean;
      num: number;
      nn: null;
      uu: undefined;
    }
    const cols: CsvColumn<R>[] = [
      { key: "big", header: "big" },
      { key: "when", header: "when" },
      { key: "flag", header: "flag" },
      { key: "num", header: "num" },
      { key: "nn", header: "nn" },
      { key: "uu", header: "uu" },
    ];
    const iso = "2020-01-01T00:00:00.000Z";
    const row = toCsv(
      [{ big: 42n, when: new Date(iso), flag: true, num: 3.5, nn: null, uu: undefined }],
      cols,
    ).split("\r\n")[1];
    expect(row).toBe(`42,${iso},true,3.5,,`);
  });
});

describe("toCsv — allowlist (secret keys can NEVER leak)", () => {
  it("emits ONLY the columns in the set, never an unlisted passwordHash/tokenHash", () => {
    const cols: CsvColumn<{ id: string }>[] = [{ key: "id", header: "id" }];
    const rows = [{ id: "u1", passwordHash: "SECRET", tokenHash: "SECRET2" }] as unknown as {
      id: string;
    }[];
    const out = toCsv(rows, cols);
    expect(out).toBe("id\r\nu1\r\n");
    expect(out).not.toContain("SECRET");
    expect(out).not.toContain("passwordHash");
    expect(out).not.toContain("tokenHash");
  });
});

describe("report column sets — no secret column present", () => {
  const headerNames = (cols: readonly CsvColumn<Record<string, unknown>>[]) =>
    cols.map((c) => c.key);

  it("USERS_EXPORT_COLUMNS mirrors USER_SELECT and carries NO passwordHash", () => {
    const keys = headerNames(USERS_EXPORT_COLUMNS as never);
    expect(keys).toContain("id");
    expect(keys).toContain("email");
    expect(keys).toContain("role");
    expect(keys).not.toContain("passwordHash");
  });

  it("APPLICATIONS_EXPORT_COLUMNS carries the Wave-10 approval columns and NO tokens", () => {
    const keys = headerNames(APPLICATIONS_EXPORT_COLUMNS as never);
    expect(keys).toContain("adminApprovedAt");
    expect(keys).toContain("adminApprovedBy");
    expect(keys).not.toContain("passwordHash");
    expect(keys).not.toContain("tokenHash");
  });

  it("AUDIT_EXPORT_COLUMNS carries the allowlist-serialized before/after and NO tokens", () => {
    const keys = headerNames(AUDIT_EXPORT_COLUMNS as never);
    expect(keys).toContain("action");
    expect(keys).toContain("targetType");
    expect(keys).not.toContain("passwordHash");
    expect(keys).not.toContain("tokenHash");
  });
});
