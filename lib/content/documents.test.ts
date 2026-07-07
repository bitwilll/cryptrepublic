import { describe, it, expect } from "vitest";
import { DOCUMENTS, DOCUMENT_KIND_LABELS, documentBySlug, documentsWithBody } from "./documents";
import { REGISTRY } from "./registry";

/**
 * Registry-of-documents integrity (Wave 15): unique slugs, every board item
 * present, valid kinds, and — the load-bearing one — every REGISTRY href that
 * points into /documents resolves to a document WITH a body (a real page).
 */

describe("lib/content/documents", () => {
  it("slugs are unique and kebab-case", () => {
    const slugs = DOCUMENTS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("contains every document from the Cabinet's board", () => {
    const slugs = new Set(DOCUMENTS.map((d) => d.slug));
    for (const required of [
      "constitution",
      "charter-of-rights",
      "penal-code",
      "national-hierarchy",
      "oath",
      "anthem",
      "citizens-prayer",
      "treasury-notes",
      "smart-cheques",
      "terms",
      "privacy",
      "onboarding-letter",
      "welcome-letter",
      "denial-letter",
      "referral-contract",
      "letterhead",
      "business-card",
      "state-stamp",
      "site-app-content",
      "advertisement-content",
    ]) {
      expect(slugs.has(required), `missing board document: ${required}`).toBe(true);
    }
    expect(DOCUMENTS.length).toBe(20);
  });

  it("every kind is labelled and every document has a title + summary", () => {
    for (const d of DOCUMENTS) {
      expect(DOCUMENT_KIND_LABELS[d.kind]).toBeTruthy();
      expect(d.title.length).toBeGreaterThan(2);
      expect(d.summary.length).toBeGreaterThan(10);
    }
  });

  it("bodies are substantial and sectioned; specimen-only items have none", () => {
    for (const d of documentsWithBody()) {
      expect(d.body!.length, `${d.slug} body too short`).toBeGreaterThan(400);
      expect(d.body, `${d.slug} lacks a "## " section heading`).toMatch(/^## /m);
    }
    for (const specimen of ["letterhead", "business-card", "state-stamp"]) {
      expect(documentBySlug(specimen)?.body).toBeUndefined();
    }
  });

  it("every REGISTRY href into /documents resolves to a document WITH a body", () => {
    for (const item of REGISTRY) {
      const href = item.href;
      if (!href || !href.startsWith("/documents")) continue;
      if (href === "/documents") continue; // the index always exists
      const slug = href.replace("/documents/", "").split(/[#?]/)[0];
      const doc = documentBySlug(slug);
      expect(doc, `registry ${item.id} → ${href}: no such document`).toBeDefined();
      expect(
        doc?.body,
        `registry ${item.id} → ${href}: document has no page (no body)`,
      ).toBeDefined();
    }
  });

  it("documentBySlug returns undefined for unknown slugs", () => {
    expect(documentBySlug("no-such-document")).toBeUndefined();
  });
});
