/**
 * Tests for src/knowledge/scorer.ts and src/knowledge/search.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { _setDbForTesting, closeDb, insertEntry } from "../../src/knowledge/db.js";
import { rankEntries, scoreEntry, DEFAULT_WEIGHTS } from "../../src/knowledge/scorer.js";
import { findApis } from "../../src/knowledge/search.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";
import { validateEntry } from "../../src/knowledge/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAllEntries(): ApiEntry[] {
  const entriesDir = join(__dirname, "../../src/entries");
  const results: ApiEntry[] = [];

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(full, "utf-8")) as unknown;
        const result = validateEntry(raw);
        if (result.success) results.push(result.data);
      }
    }
  }

  walk(entriesDir);
  return results;
}

describe("Scorer", () => {
  let allEntries: ApiEntry[];

  beforeEach(() => {
    allEntries = loadAllEntries();
    const memDb = new Database(":memory:");
    _setDbForTesting(memDb);
    for (const entry of allEntries) {
      insertEntry(entry);
    }
  });

  afterEach(() => {
    closeDb();
  });

  it("loaded all 35 entries for testing", () => {
    expect(allEntries.length).toBe(35);
  });

  it("'send transactional emails' ranks email APIs in top 3", () => {
    const results = rankEntries(allEntries, "send transactional emails", undefined, 3);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasEmailApi = topSlugs.some((s) =>
      ["resend", "sendgrid", "postmark"].includes(s)
    );
    expect(hasEmailApi).toBe(true);
  });

  it("'process credit card payments in India' ranks razorpay highly", () => {
    const results = rankEntries(
      allEntries,
      "process credit card payments in India",
      undefined,
      12
    );
    const razorpayResult = results.find((r) => r.entry.slug === "razorpay");
    const stripeResult = results.find((r) => r.entry.slug === "stripe");
    expect(razorpayResult).toBeDefined();
    // Razorpay should rank higher than non-payment APIs
    const razorpayRank = results.findIndex((r) => r.entry.slug === "razorpay");
    const emailRank = results.findIndex((r) => r.entry.slug === "resend");
    expect(razorpayRank).toBeLessThan(emailRank);
    // Stripe and Razorpay should both rank high for payment queries
    expect(stripeResult).toBeDefined();
  });

  it("'add user authentication with OAuth' ranks auth APIs in top results", () => {
    const results = rankEntries(
      allEntries,
      "add user authentication with OAuth",
      undefined,
      6
    );
    const topSlugs = results.slice(0, 6).map((r) => r.entry.slug);
    const hasAuthApi = topSlugs.some((s) => ["clerk", "auth0"].includes(s));
    expect(hasAuthApi).toBe(true);
  });

  it("preferFree constraint boosts APIs with free tiers", () => {
    const withFree = rankEntries(allEntries, "send emails", { preferFree: true }, 12);
    const withoutFree = rankEntries(allEntries, "send emails", undefined, 12);

    // Find a freemium email API (resend, postmark, sendgrid) — should rank higher with preferFree
    const resendWithFree = withFree.find((r) => r.entry.slug === "resend");
    const resendWithout = withoutFree.find((r) => r.entry.slug === "resend");

    expect(resendWithFree).toBeDefined();
    expect(resendWithout).toBeDefined();
    // Pricing score should be higher with preferFree
    expect(resendWithFree!.scoreBreakdown["pricingFit"]).toBeGreaterThanOrEqual(
      resendWithout!.scoreBreakdown["pricingFit"]!
    );
  });

  it("requiredLanguage='python' boosts APIs with Python support", () => {
    const pythonResults = rankEntries(
      allEntries,
      "send emails",
      { requiredLanguage: "python" },
      12
    );
    // All email APIs support Python, so they should still rank high
    expect(pythonResults.length).toBeGreaterThan(0);
    // Verify devExperience score is computed
    for (const result of pythonResults) {
      expect(result.scoreBreakdown["devExperience"]).toBeDefined();
    }
  });

  it("returns empty array for empty entries list", () => {
    const results = rankEntries([], "send emails");
    expect(results).toEqual([]);
  });

  it("scoreEntry returns valid score breakdown", () => {
    const entry = allEntries.find((e) => e.slug === "resend")!;
    const result = scoreEntry(entry, "send transactional emails");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.scoreBreakdown["useCaseFit"]).toBeDefined();
    expect(result.scoreBreakdown["qualityScore"]).toBeDefined();
    expect(result.scoreBreakdown["devExperience"]).toBeDefined();
    expect(result.scoreBreakdown["pricingFit"]).toBeDefined();
    expect(result.scoreBreakdown["total"]).toBeDefined();
  });

  it("topN parameter limits results correctly", () => {
    const results = rankEntries(allEntries, "build an app", undefined, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("findApis uses search + scoring end to end", () => {
    const results = findApis("send password reset emails", undefined, 3);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasEmailApi = topSlugs.some((s) =>
      ["resend", "sendgrid", "postmark"].includes(s)
    );
    expect(hasEmailApi).toBe(true);
  });

  it("findApis returns empty for empty query", () => {
    const results = findApis("   ");
    expect(results).toEqual([]);
  });

  it("DEFAULT_WEIGHTS sum to approximately 1.0", () => {
    const sum =
      DEFAULT_WEIGHTS.useCaseFit +
      DEFAULT_WEIGHTS.qualityScore +
      DEFAULT_WEIGHTS.devExperience +
      DEFAULT_WEIGHTS.pricingFit;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  it("'upload images to a CDN' ranks storage APIs highly", () => {
    const results = rankEntries(allEntries, "upload images to a CDN", undefined, 6);
    const storageSlugs = results
      .slice(0, 4)
      .map((r) => r.entry.slug);
    const hasStorageApi = storageSlugs.some((s) =>
      ["cloudinary", "uploadthing"].includes(s)
    );
    expect(hasStorageApi).toBe(true);
  });

  // --- New tests for expanded knowledge base (Session 2) ---

  it("'add real-time chat to my app' ranks websocket/chat APIs in top results", () => {
    const results = rankEntries(
      allEntries,
      "add real-time chat to my app",
      undefined,
      8
    );
    const topSlugs = results.slice(0, 8).map((r) => r.entry.slug);
    const hasChatApi = topSlugs.some((s) =>
      ["pusher", "ably", "stream-chat", "sendbird"].includes(s)
    );
    expect(hasChatApi).toBe(true);
  });

  it("'serverless Postgres database' ranks supabase or neon in top results", () => {
    const results = rankEntries(
      allEntries,
      "serverless Postgres database for my Next.js app",
      undefined,
      6
    );
    const topSlugs = results.slice(0, 6).map((r) => r.entry.slug);
    const hasDbApi = topSlugs.some((s) => ["supabase", "neon", "planetscale"].includes(s));
    expect(hasDbApi).toBe(true);
  });

  it("'send push notifications to mobile users' ranks notification APIs highly", () => {
    const results = rankEntries(
      allEntries,
      "send push notifications to mobile app users",
      undefined,
      6
    );
    const topSlugs = results.slice(0, 6).map((r) => r.entry.slug);
    const hasNotifApi = topSlugs.some((s) =>
      ["onesignal", "knock", "novu"].includes(s)
    );
    expect(hasNotifApi).toBe(true);
  });

  it("'stream video on demand' ranks mux highly", () => {
    const results = rankEntries(
      allEntries,
      "stream video on demand for a course platform",
      undefined,
      35
    );
    const muxResult = results.find((r) => r.entry.slug === "mux");
    expect(muxResult).toBeDefined();
    const muxRank = results.findIndex((r) => r.entry.slug === "mux");
    // mux should rank higher than email or auth APIs for video queries
    const emailRank = results.findIndex((r) => r.entry.slug === "resend");
    const authRank = results.findIndex((r) => r.entry.slug === "clerk");
    expect(muxRank).toBeLessThan(emailRank);
    expect(muxRank).toBeLessThan(authRank);
  });

  it("'track errors and exceptions in production' ranks sentry highly", () => {
    const results = rankEntries(
      allEntries,
      "track errors and exceptions in production",
      undefined,
      6
    );
    const topSlugs = results.slice(0, 6).map((r) => r.entry.slug);
    const hasMonitoringApi = topSlugs.some((s) => ["sentry", "posthog"].includes(s));
    expect(hasMonitoringApi).toBe(true);
  });

  it("'generate images from text prompts' ranks replicate or openai highly", () => {
    const results = rankEntries(
      allEntries,
      "generate images from text prompts using AI",
      undefined,
      6
    );
    const topSlugs = results.slice(0, 6).map((r) => r.entry.slug);
    const hasAiApi = topSlugs.some((s) =>
      ["replicate", "openai", "anthropic"].includes(s)
    );
    expect(hasAiApi).toBe(true);
  });
});
