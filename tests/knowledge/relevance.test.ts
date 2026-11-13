/**
 * Tests for src/knowledge/relevance.ts and the relevance-gated scorer.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { _setDbForTesting, closeDb, insertEntry } from "../../src/knowledge/db.js";
import { resetTfIdfEngine } from "../../src/knowledge/tfidf.js";
import { findApis } from "../../src/knowledge/search.js";
import { tokensMatch, buildRelevanceModel, entryRelevance } from "../../src/knowledge/relevance.js";
import { rankEntries, scoreEntry, PRIOR_INFLUENCE, KEYWORD_RANK_WEIGHT } from "../../src/knowledge/scorer.js";
import { loadEntriesFromDir, resolveEntriesDir } from "../../src/knowledge/loader.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

const entries = loadEntriesFromDir(resolveEntriesDir()).entries;
const bySlug = (slug: string): ApiEntry => entries.find((e) => e.slug === slug)!;

function relevanceOf(query: string, slug: string): number {
  return entryRelevance(buildRelevanceModel(query, entries), slug);
}

describe("tokensMatch (light stemming)", () => {
  it.each([
    ["image", "images"],
    ["upload", "uploaded"],
    ["transcribe", "transcription"],
    ["generate", "generation"],
    ["email", "emails"],
  ])("%s ~ %s", (a, b) => expect(tokensMatch(a, b)).toBe(true));

  it.each([
    ["store", "storefront"],
    ["pay", "payment"],
    ["image", "imagine"],
  ])("%s !~ %s", (a, b) => expect(tokensMatch(a, b)).toBe(false));

  it("product names only match exactly when given the product-name set", () => {
    const names = new Set(["openai", "uploadthing", "auth0"]);
    expect(tokensMatch("open", "openai")).toBe(true); // plain stemming would
    expect(tokensMatch("open", "openai", names)).toBe(false);
    expect(tokensMatch("upload", "uploadthing", names)).toBe(false);
    expect(tokensMatch("auth0", "auth0", names)).toBe(true);
    expect(tokensMatch("images", "image", names)).toBe(true);
  });
});

describe("relevance model", () => {
  it("ignores 'partial' use cases (known poor fits)", () => {
    // Anthropic lists "Generate images or audio" as partial; it must not
    // look as relevant as a real image-generation API.
    expect(relevanceOf("generate images from text", "anthropic")).toBeLessThan(
      0.6 * relevanceOf("generate images from text", "stability-ai")
    );
    // Twilio lists "Send transactional emails" as partial.
    expect(relevanceOf("send transactional emails", "twilio")).toBeLessThan(
      0.6 * relevanceOf("send transactional emails", "resend")
    );
  });

  it("word order matters: speech-to-text beats text-to-speech", () => {
    expect(relevanceOf("speech to text transcription", "deepgram")).toBeGreaterThan(
      relevanceOf("speech to text transcription", "eleven-labs")
    );
  });

  it("brand names in synonym groups are not used as synonyms", () => {
    // "text" triggers the SMS synonym group, which contains "twilio";
    // Twilio must not gain relevance for a search query through it.
    expect(relevanceOf("full text search for my product catalog", "twilio")).toBeLessThan(0.2);
  });

  it("is 0 for a query with no known words", () => {
    expect(relevanceOf("quantum entanglement xyzzy", "stripe")).toBe(0);
  });

  it("is low everywhere when most of the query is unknown", () => {
    const model = buildRelevanceModel("quantum-entanglement-api-xyz-9999", entries);
    for (const e of entries) expect(entryRelevance(model, e.slug)).toBeLessThan(0.2);
  });
});

describe("relevance gates the score", () => {
  it("an irrelevant entry scores ~0 regardless of quality, DX or pricing", () => {
    const stripe = rankEntries(entries, "speech to text transcription", undefined, entries.length).find(
      (r) => r.entry.slug === "stripe"
    )!;
    expect(stripe.relevance).toBe(0);
    expect(stripe.score).toBe(0);
  });

  it("the prior scales a score between (1 − PRIOR_INFLUENCE)× and 1× of relevance (+ keyword term)", () => {
    const r = scoreEntry(bySlug("resend"), "send transactional emails");
    const relevance = r.relevance!;
    const keywordTerm =
      r.scoreBreakdown["keywordRelevance"]! * KEYWORD_RANK_WEIGHT * r.scoreBreakdown["categoryFit"]!;
    expect(r.score).toBeLessThanOrEqual(relevance + keywordTerm + 0.005);
    expect(r.score).toBeGreaterThanOrEqual(relevance * (1 - PRIOR_INFLUENCE) + keywordTerm - 0.005);
  });

  it("a more relevant, lower-quality entry outranks a less relevant, higher-quality one", () => {
    // Cloudinary (quality 8) vs Stripe (quality 10) for an image task
    const ranked = rankEntries(entries, "store user uploaded images and resize them", undefined, entries.length);
    const pos = (slug: string) => ranked.findIndex((r) => r.entry.slug === slug);
    expect(pos("cloudinary")).toBeLessThan(pos("stripe"));
  });
});

describe("naming an API recommends that API", () => {
  beforeAll(() => {
    _setDbForTesting(new Database(":memory:"));
    for (const e of entries) insertEntry(e);
  });

  afterAll(() => {
    closeDb();
    resetTfIdfEngine();
  });

  // Regression: entries that MENTION a product ("the open-source Firebase
  // alternative", "open source" ~ "openai") used to tie with it and win on prior.
  it.each([
    ["firebase", "firebase"],
    ["openai", "openai"],
    ["auth0", "auth0"],
    ["uploadthing", "uploadthing"],
    ["digitalocean", "digital-ocean-spaces"],
    ["cal.com", "cal-com"],
    ["add auth0 login", "auth0"],
    ["send emails with resend", "resend"],
  ])("'%s' → %s", (query, slug) => {
    expect(findApis(query, undefined, 3)[0]?.entry.slug).toBe(slug);
  });

  it("'cal' (Cal.com) no longer matches 'calls'", () => {
    const slugs = findApis("make outbound voice calls", undefined, 3).map((r) => r.entry.slug);
    expect(slugs).not.toContain("cal-com");
  });
});
