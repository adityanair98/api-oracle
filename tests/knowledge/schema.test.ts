/**
 * Tests for src/knowledge/schema.ts
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ApiEntrySchema, validateEntry } from "../../src/knowledge/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(): unknown {
  const fixturePath = join(__dirname, "../fixtures/sample-entry.json");
  return JSON.parse(readFileSync(fixturePath, "utf-8"));
}

describe("ApiEntrySchema", () => {
  it("valid entry passes validation", () => {
    const fixture = loadFixture();
    const result = ApiEntrySchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it("validateEntry returns typed data on success", () => {
    const fixture = loadFixture();
    const result = validateEntry(fixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("resend");
      expect(result.data.category).toBe("email");
      expect(result.data.qualityScore).toBe(9);
    }
  });

  it("missing name field fails with clear error", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const { name: _removed, ...withoutName } = fixture;
    const result = validateEntry(withoutName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    }
  });

  it("missing slug fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const { slug: _removed, ...withoutSlug } = fixture;
    const result = validateEntry(withoutSlug);
    expect(result.success).toBe(false);
  });

  it("invalid category enum fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadCategory = { ...fixture, category: "invalid-category" };
    const result = validateEntry(withBadCategory);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("category"))).toBe(true);
    }
  });

  it("invalid slug format fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadSlug = { ...fixture, slug: "My API Name" }; // spaces not allowed
    const result = validateEntry(withBadSlug);
    expect(result.success).toBe(false);
  });

  it("qualityScore below 1 fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadScore = { ...fixture, qualityScore: 0 };
    const result = validateEntry(withBadScore);
    expect(result.success).toBe(false);
  });

  it("qualityScore above 10 fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadScore = { ...fixture, qualityScore: 11 };
    const result = validateEntry(withBadScore);
    expect(result.success).toBe(false);
  });

  it("invalid auth method fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadAuth = {
      ...fixture,
      auth: { ...((fixture as Record<string, unknown>)["auth"] as object), method: "magic" },
    };
    const result = validateEntry(withBadAuth);
    expect(result.success).toBe(false);
  });

  it("empty useCases array fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withNoUseCases = { ...fixture, useCases: [] };
    const result = validateEntry(withNoUseCases);
    expect(result.success).toBe(false);
  });

  it("fewer than 2 gotchas fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withOneGotcha = { ...fixture, gotchas: ["only one gotcha"] };
    const result = validateEntry(withOneGotcha);
    expect(result.success).toBe(false);
  });

  it("invalid lastVerified date format fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadDate = { ...fixture, lastVerified: "February 25 2026" };
    const result = validateEntry(withBadDate);
    expect(result.success).toBe(false);
  });

  it("invalid pricing URL fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadPricing = {
      ...fixture,
      pricing: {
        ...((fixture as Record<string, unknown>)["pricing"] as object),
        pricingUrl: "not-a-url",
      },
    };
    const result = validateEntry(withBadPricing);
    expect(result.success).toBe(false);
  });

  it("nullable fields accept null", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withNulls = {
      ...fixture,
      pricing: {
        ...((fixture as Record<string, unknown>)["pricing"] as object),
        freeTier: null,
        startingPrice: null,
        costPer: null,
      },
      reliability: {
        ...((fixture as Record<string, unknown>)["reliability"] as object),
        uptimeGuarantee: null,
        statusPageUrl: null,
      },
    };
    const result = validateEntry(withNulls);
    expect(result.success).toBe(true);
  });

  it("empty alternatives array is valid", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withNoAlts = { ...fixture, alternatives: [] };
    const result = validateEntry(withNoAlts);
    expect(result.success).toBe(true);
  });

  it("invalid use case fit value fails", () => {
    const fixture = loadFixture() as Record<string, unknown>;
    const withBadFit = {
      ...fixture,
      useCases: [{ task: "Some task", fit: "excellent" }],
    };
    const result = validateEntry(withBadFit);
    expect(result.success).toBe(false);
  });
});
