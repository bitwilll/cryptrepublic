import { describe, it, expect } from "vitest";
import { formatOfficeTitle, groupRosterByOffice } from "./display";
import { CIVIC_OFFICES, OFFICE_LABELS } from "./types";

describe("formatOfficeTitle", () => {
  it("joins label and portfolio with a middle dot", () => {
    expect(formatOfficeTitle("MINISTER", "Treasury")).toBe("Minister · Treasury");
    expect(formatOfficeTitle("PRIME_MINISTER", "Digital Infrastructure")).toBe(
      "Prime Minister · Digital Infrastructure",
    );
  });

  it("returns the bare label when the portfolio is absent, null, or blank", () => {
    expect(formatOfficeTitle("SENATOR")).toBe("Senator");
    expect(formatOfficeTitle("SENATOR", null)).toBe("Senator");
    expect(formatOfficeTitle("SENATOR", "   ")).toBe("Senator");
  });

  it("trims portfolio whitespace", () => {
    expect(formatOfficeTitle("PROTECTOR", "  Border Watch ")).toBe("Protector · Border Watch");
  });

  it("has a label for every civic office", () => {
    for (const office of CIVIC_OFFICES) {
      expect(formatOfficeTitle(office)).toBe(OFFICE_LABELS[office]);
      expect(formatOfficeTitle(office)).toBeTruthy();
    }
  });
});

describe("groupRosterByOffice", () => {
  it("groups rows by office in protocol precedence order (PM first)", () => {
    const rows = [
      { office: "LEGISLATOR", name: "d" },
      { office: "PRIME_MINISTER", name: "a" },
      { office: "MINISTER", name: "b" },
      { office: "SENATOR", name: "c" },
    ] as const;
    const groups = groupRosterByOffice([...rows]);
    expect(groups.map((g) => g.office)).toEqual([
      "PRIME_MINISTER",
      "MINISTER",
      "SENATOR",
      "LEGISLATOR",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Prime Minister",
      "Minister",
      "Senator",
      "Legislator",
    ]);
  });

  it("only includes offices that have holders", () => {
    const groups = groupRosterByOffice([{ office: "SENATOR" as const }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.office).toBe("SENATOR");
  });

  it("preserves input order within an office (API sorts appointedAt asc)", () => {
    const groups = groupRosterByOffice([
      { office: "MINISTER" as const, name: "first" },
      { office: "MINISTER" as const, name: "second" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.holders.map((h) => h.name)).toEqual(["first", "second"]);
  });

  it("returns an empty array for an empty roster", () => {
    expect(groupRosterByOffice([])).toEqual([]);
  });
});
