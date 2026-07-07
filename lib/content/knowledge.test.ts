import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE,
  KNOWLEDGE_THEMES,
  knowledgeBySlug,
  knowledgeByTheme,
  sectionAnchor,
} from "./knowledge";
import { REGISTRY, registryItem } from "./registry";

/**
 * State Encyclopedia integrity (Wave 15): 14 articles, unique slugs, every
 * `related` id resolves in the REGISTRY, every REGISTRY href into /knowledge
 * resolves to an article, and per-article section anchors are unique (the
 * table of contents depends on it).
 */

describe("lib/content/knowledge", () => {
  it("has the 14 commissioned articles with unique kebab-case slugs", () => {
    expect(KNOWLEDGE.length).toBe(14);
    const slugs = KNOWLEDGE.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const required of [
      "one-portal-authentication",
      "no-kyc",
      "trust-score",
      "the-passport",
      "witness-attestation",
      "dividends",
      "sovereign-wallet",
      "referrals",
      "governance-and-votes",
      "citizen-store",
      "bitwill-inheritance",
      "signing-and-certificates",
      "citizen-insurance",
      "treasury-and-holdings",
    ]) {
      expect(slugs, `missing article: ${required}`).toContain(required);
    }
  });

  it("every related id exists in the REGISTRY", () => {
    for (const a of KNOWLEDGE) {
      expect(a.related.length).toBeGreaterThan(0);
      for (const id of a.related) {
        expect(registryItem(id), `${a.slug} relates to unknown registry id "${id}"`).toBeDefined();
      }
    }
  });

  it("every REGISTRY href into /knowledge resolves to an article", () => {
    for (const item of REGISTRY) {
      const href = item.href;
      if (!href || !href.startsWith("/knowledge")) continue;
      if (href === "/knowledge") continue; // the index always exists
      const slug = href.replace("/knowledge/", "").split(/[#?]/)[0];
      expect(knowledgeBySlug(slug), `registry ${item.id} → ${href}: no such article`).toBeDefined();
    }
  });

  it("articles are substantial: standfirst + at least two sections with bodies", () => {
    for (const a of KNOWLEDGE) {
      expect(a.standfirst.length, `${a.slug} standfirst`).toBeGreaterThan(40);
      expect(a.sections.length, `${a.slug} sections`).toBeGreaterThanOrEqual(2);
      for (const s of a.sections) {
        expect(s.heading.length).toBeGreaterThan(2);
        expect(s.body.length, `${a.slug} / ${s.heading}`).toBeGreaterThan(120);
      }
    }
  });

  it("section anchors are unique within each article (table of contents)", () => {
    for (const a of KNOWLEDGE) {
      const anchors = a.sections.map((s) => sectionAnchor(s.heading));
      expect(new Set(anchors).size, `${a.slug} has duplicate section anchors`).toBe(anchors.length);
      for (const anchor of anchors) expect(anchor).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("themes are exhaustive and grouping preserves every article", () => {
    const grouped = knowledgeByTheme();
    let total = 0;
    for (const theme of KNOWLEDGE_THEMES) total += grouped[theme].length;
    expect(total).toBe(KNOWLEDGE.length);
    for (const a of KNOWLEDGE) expect(KNOWLEDGE_THEMES).toContain(a.theme);
  });

  it("knowledgeBySlug returns undefined for unknown slugs", () => {
    expect(knowledgeBySlug("no-such-article")).toBeUndefined();
  });
});
