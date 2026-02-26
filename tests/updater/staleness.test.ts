/**
 * Tests for src/updater/staleness.ts
 */

import { describe, it, expect } from "vitest";
import {
  getStalenessLevel,
  daysSince,
  checkStaleness,
  checkAllEntries,
  filterByLevel,
} from "../../src/updater/staleness.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

// ─── Minimal entry factory ────────────────────────────────────────────────────

function makeEntry(slug: string, lastVerified: string): ApiEntry {
  return {
    slug,
    name: slug,
    category: "email",
    subcategory: "transactional",
    website: "https://example.com",
    description: "A minimal test entry for staleness tests.",
    useCases: [{ task: "send emails", fit: "perfect" }],
    auth: {
      method: "api_key",
      setupSteps: ["step 1"],
      envVarName: "TEST_API_KEY",
      codeSnippet: "const x = 1;",
    },
    pricing: {
      model: "freemium",
      freeTier: "Free tier",
      startingPrice: "$10/month",
      costPer: null,
      pricingUrl: "https://example.com/pricing",
    },
    rateLimits: {
      tier: "free",
      limit: "1000/day",
      notes: "No notes",
      retryStrategy: "Retry on 429",
    },
    sdk: {
      primaryLanguage: "typescript",
      installCommand: "npm install test",
      importStatement: "import test from 'test';",
      otherLanguages: [],
    },
    codeExamples: [{ title: "Example", language: "typescript", code: "const x = 1;", notes: "" }],
    gotchas: ["gotcha 1", "gotcha 2"],
    reliability: {
      uptimeGuarantee: "99.9%",
      statusPageUrl: "https://status.example.com",
      notes: "Reliable",
    },
    qualityScore: 7,
    qualityJustification: "Good quality entry.",
    alternatives: [],
    complementary: [],
    bestFor: "Testing staleness",
    lastVerified,
    entryVersion: 1,
    addedBy: "test",
  };
}

// A fixed "today" for deterministic tests
const TODAY = new Date("2026-06-01T00:00:00Z");

describe("getStalenessLevel", () => {
  it("returns fresh for < 90 days", () => {
    expect(getStalenessLevel(0)).toBe("fresh");
    expect(getStalenessLevel(89)).toBe("fresh");
  });

  it("returns aging for 90–179 days", () => {
    expect(getStalenessLevel(90)).toBe("aging");
    expect(getStalenessLevel(179)).toBe("aging");
  });

  it("returns stale for 180–364 days", () => {
    expect(getStalenessLevel(180)).toBe("stale");
    expect(getStalenessLevel(364)).toBe("stale");
  });

  it("returns critical for 365+ days", () => {
    expect(getStalenessLevel(365)).toBe("critical");
    expect(getStalenessLevel(1000)).toBe("critical");
  });
});

describe("daysSince", () => {
  it("returns 0 for today", () => {
    expect(daysSince("2026-06-01", TODAY)).toBe(0);
  });

  it("returns correct count for a past date", () => {
    expect(daysSince("2026-03-03", TODAY)).toBe(90); // 90 days before June 1
  });

  it("returns 0 for future date (clamp)", () => {
    expect(daysSince("2026-12-31", TODAY)).toBe(0);
  });
});

describe("checkStaleness", () => {
  it("fresh entry verified today", () => {
    const entry = makeEntry("stripe", "2026-06-01");
    const info = checkStaleness(entry, TODAY);
    expect(info.level).toBe("fresh");
    expect(info.daysSinceVerified).toBe(0);
    expect(info.slug).toBe("stripe");
  });

  it("aging entry verified 120 days ago", () => {
    // 120 days before 2026-06-01 = 2026-02-01
    const entry = makeEntry("sendgrid", "2026-02-01");
    const info = checkStaleness(entry, TODAY);
    expect(info.level).toBe("aging");
    expect(info.daysSinceVerified).toBeGreaterThanOrEqual(90);
  });

  it("critical entry verified 400 days ago", () => {
    // ~400 days before 2026-06-01 = ~2025-04-27
    const entry = makeEntry("old-api", "2025-04-27");
    const info = checkStaleness(entry, TODAY);
    expect(info.level).toBe("critical");
    expect(info.daysSinceVerified).toBeGreaterThanOrEqual(365);
  });
});

describe("checkAllEntries", () => {
  it("sorts most-stale first", () => {
    const entries = [
      makeEntry("fresh", "2026-05-31"),
      makeEntry("critical", "2024-01-01"),
      makeEntry("aging", "2026-01-01"),
    ];
    const infos = checkAllEntries(entries, TODAY);
    expect(infos[0]!.slug).toBe("critical");
    expect(infos[infos.length - 1]!.slug).toBe("fresh");
  });

  it("returns one info per entry", () => {
    const entries = [
      makeEntry("a", "2026-05-01"),
      makeEntry("b", "2026-04-01"),
    ];
    expect(checkAllEntries(entries, TODAY)).toHaveLength(2);
  });
});

describe("filterByLevel", () => {
  it("filters by level correctly", () => {
    const entries = [
      makeEntry("fresh", "2026-06-01"),
      makeEntry("stale", "2025-10-01"),
    ];
    const infos = checkAllEntries(entries, TODAY);
    const stale = filterByLevel(infos, "stale");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.slug).toBe("stale");
  });
});
