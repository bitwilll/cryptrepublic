import { describe, it, expect } from "vitest";
import {
  COMMISSARY,
  COMMISSARY_CATEGORIES,
  commissaryByCategory,
  commissaryItem,
  isCommissaryItemId,
} from "./commissary";

/**
 * Commissary catalogue integrity (Wave 15): unique ids, valid categories,
 * every board item present, and the id guard the API's zod schema relies on.
 */

describe("lib/content/commissary", () => {
  it("ids are unique and kebab-case", () => {
    const ids = COMMISSARY.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("contains every item from the Cabinet's board", () => {
    const ids = new Set(COMMISSARY.map((i) => i.id));
    for (const required of [
      // Insignia
      "enamel-pins",
      "passport-booklet",
      "smart-card",
      "badges",
      // Apparel
      "tshirts-shirts",
      "socks",
      "handkerchief-towel",
      "cufflinks",
      // Homeware
      "cup-mug",
      "cutlery-set",
      "card-holder",
      "water-bottle-flask",
      "fridge-magnet",
      // Personal
      "tongue-cleaner",
      "toothbrush-metal",
      "metal-comb",
      "fragrance",
      "rings",
      "keychain",
      // Provisions
      "chocolates-cookies",
      "tea-coffee",
      "water",
      "soft-drinks",
      "chewing-gum",
      "mints",
      "psyllium-husk",
      "vit-c-tabs",
      "electrolyte-powder",
      "soda",
      "kombucha",
      // Instruments
      "pendrives",
      "crypto-node",
      "coins-enamel",
      "state-stamp",
    ]) {
      expect(ids.has(required), `missing board item: ${required}`).toBe(true);
    }
    expect(COMMISSARY.length).toBe(34);
  });

  it("every item has a valid category, a title, and a note", () => {
    for (const item of COMMISSARY) {
      expect(COMMISSARY_CATEGORIES).toContain(item.category);
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.note.length).toBeGreaterThan(10);
    }
  });

  it("board titles that carry exact wording are preserved", () => {
    expect(commissaryItem("enamel-pins")?.title).toBe("Enamel pins — glow in dark");
    expect(commissaryItem("cutlery-set")?.title).toBe(
      "Cutlery — plates, knife, spoon, fork, soup spoon",
    );
    expect(commissaryItem("psyllium-husk")?.title).toBe("Psyllium husk [isabgul]");
    expect(commissaryItem("crypto-node")?.title).toBe("CryptRepublic crypto node");
    expect(commissaryItem("coins-enamel")?.title).toBe("Coins with enamel");
  });

  it("isCommissaryItemId guards exactly the catalogue (the API depends on it)", () => {
    for (const item of COMMISSARY) expect(isCommissaryItemId(item.id)).toBe(true);
    expect(isCommissaryItemId("not-a-real-item")).toBe(false);
    expect(isCommissaryItemId("")).toBe(false);
  });

  it("grouping by category preserves every item and board order", () => {
    const grouped = commissaryByCategory();
    let total = 0;
    for (const c of COMMISSARY_CATEGORIES) total += grouped[c].length;
    expect(total).toBe(COMMISSARY.length);
    expect(grouped.Insignia[0].id).toBe("enamel-pins");
    expect(grouped.Provisions.length).toBe(11);
  });
});
