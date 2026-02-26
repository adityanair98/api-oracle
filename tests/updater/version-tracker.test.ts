/**
 * Tests for src/updater/version-tracker.ts
 */

import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  diffSnapshot,
} from "../../src/updater/version-tracker.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

function makeEntry(slug: string, version: number): ApiEntry {
  return {
    slug,
    name: slug,
    category: "email",
    subcategory: "transactional",
    website: "https://example.com",
    description: "A test entry for version tracking.",
    useCases: [{ task: "test", fit: "perfect" }],
    auth: {
      method: "api_key",
      setupSteps: ["step 1"],
      envVarName: "TEST_KEY",
      codeSnippet: "const x = 1;",
    },
    pricing: {
      model: "freemium",
      freeTier: null,
      startingPrice: null,
      costPer: null,
      pricingUrl: "https://example.com/pricing",
    },
    rateLimits: {
      tier: "free",
      limit: "1000/day",
      notes: "none",
      retryStrategy: "retry",
    },
    sdk: {
      primaryLanguage: "typescript",
      installCommand: "npm install test",
      importStatement: "import test from 'test';",
      otherLanguages: [],
    },
    codeExamples: [{ title: "Ex", language: "typescript", code: "const x=1;", notes: "" }],
    gotchas: ["gotcha 1", "gotcha 2"],
    reliability: { uptimeGuarantee: null, statusPageUrl: null, notes: "ok" },
    qualityScore: 5,
    qualityJustification: "Test entry.",
    alternatives: [],
    complementary: [],
    bestFor: "testing",
    lastVerified: "2026-02-25",
    entryVersion: version,
    addedBy: "test",
  };
}

describe("buildSnapshot", () => {
  it("creates a slug → version map", () => {
    const entries = [makeEntry("stripe", 2), makeEntry("resend", 1)];
    const snap = buildSnapshot(entries);
    expect(snap["stripe"]).toBe(2);
    expect(snap["resend"]).toBe(1);
  });

  it("returns empty object for no entries", () => {
    expect(buildSnapshot([])).toEqual({});
  });
});

describe("diffSnapshot", () => {
  it("detects new entries not in snapshot", () => {
    const entries = [makeEntry("stripe", 1)];
    const diffs = diffSnapshot(entries, {});
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.changeType).toBe("new");
    expect(diffs[0]!.slug).toBe("stripe");
    expect(diffs[0]!.previousVersion).toBeNull();
  });

  it("detects updated entries with incremented version", () => {
    const entries = [makeEntry("stripe", 3)];
    const prev = { stripe: 2 };
    const diffs = diffSnapshot(entries, prev);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.changeType).toBe("updated");
    expect(diffs[0]!.previousVersion).toBe(2);
    expect(diffs[0]!.currentVersion).toBe(3);
  });

  it("ignores entries with same version", () => {
    const entries = [makeEntry("stripe", 1), makeEntry("resend", 1)];
    const prev = { stripe: 1, resend: 1 };
    const diffs = diffSnapshot(entries, prev);
    expect(diffs).toHaveLength(0);
  });

  it("returns results sorted by slug", () => {
    const entries = [makeEntry("z-api", 1), makeEntry("a-api", 1)];
    const diffs = diffSnapshot(entries, {});
    expect(diffs[0]!.slug).toBe("a-api");
    expect(diffs[1]!.slug).toBe("z-api");
  });
});
