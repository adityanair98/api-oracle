/**
 * Tests for src/tools/find-api.ts
 * Integration tests for the find_best_api MCP tool handler.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { readdirSync, statSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { _setDbForTesting, closeDb, insertEntry } from "../../src/knowledge/db.js";
import { resetTfIdfEngine } from "../../src/knowledge/tfidf.js";
import { findApis } from "../../src/knowledge/search.js";
import { validateEntry } from "../../src/knowledge/schema.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAllEntries(): ApiEntry[] {
  const entriesDir = join(__dirname, "../../src/entries");
  const results: ApiEntry[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(full, "utf-8")) as unknown;
        const result = validateEntry(raw);
        if (result.success) results.push(result.data);
      }
    }
  }
  walk(entriesDir);
  return results;
}

describe("find_best_api tool (via findApis)", () => {
  beforeEach(() => {
    const memDb = new Database(":memory:");
    _setDbForTesting(memDb);
    for (const entry of loadAllEntries()) {
      insertEntry(entry);
    }
  });

  afterEach(() => {
    closeDb();
    resetTfIdfEngine();
  });

  it("returns recommendation for email task", () => {
    const results = findApis("send transactional emails", undefined, 3);
    expect(results.length).toBeGreaterThan(0);
    const topSlug = results[0]!.entry.slug;
    expect(["resend", "sendgrid", "postmark"]).toContain(topSlug);
  });

  it("returns up to 3 alternatives", () => {
    const results = findApis("process payments online", undefined, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("result includes score breakdown", () => {
    const results = findApis("add authentication to my app", undefined, 1);
    expect(results[0]).toBeDefined();
    const breakdown = results[0]!.scoreBreakdown;
    expect(breakdown["useCaseFit"]).toBeDefined();
    expect(breakdown["qualityScore"]).toBeDefined();
    expect(breakdown["developerExperience"]).toBeDefined();
    expect(breakdown["pricingFit"]).toBeDefined();
    expect(breakdown["total"]).toBeDefined();
  });

  it("handles no results for nonsense query gracefully", () => {
    // Even for nonsense, scorer will return something from all entries
    // but with low scores
    const results = findApis("quantum-entanglement-api-xyz-9999", undefined, 1);
    // Should not throw, may return low-scored results
    expect(Array.isArray(results)).toBe(true);
  });

  it("preferFree constraint returns freemium APIs", () => {
    const results = findApis("send emails", { preferFree: true }, 3);
    expect(results.length).toBeGreaterThan(0);
    // Top result should have a free tier
    const top = results[0]!.entry;
    expect(["freemium", "free", "open_source"]).toContain(top.pricing.model);
  });

  it("result entries have required fields", () => {
    const results = findApis("store and serve images", undefined, 1);
    expect(results.length).toBeGreaterThan(0);
    const entry = results[0]!.entry;
    expect(entry.name).toBeTruthy();
    expect(entry.slug).toBeTruthy();
    expect(entry.sdk.installCommand).toBeTruthy();
    expect(entry.auth.envVarName).toBeTruthy();
    expect(entry.codeExamples.length).toBeGreaterThan(0);
    expect(entry.gotchas.length).toBeGreaterThanOrEqual(2);
  });

  // ─── New category scenarios (Session 4) ──────────────────────────────────

  it("'deploy a Next.js app' returns a devops/hosting API in top results", () => {
    const results = findApis("deploy a Next.js app to production", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasDevOps = topSlugs.some((s) =>
      ["vercel", "netlify", "railway", "fly-io"].includes(s)
    );
    expect(hasDevOps).toBe(true);
  });

  it("'store user-uploaded files' returns a storage/infrastructure API", () => {
    const results = findApis("store user-uploaded files with a CDN", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasStorage = topSlugs.some((s) =>
      ["aws-s3", "cloudflare-r2", "cloudinary", "uploadthing", "digital-ocean-spaces"].includes(s)
    );
    expect(hasStorage).toBe(true);
  });

  it("'add a blog or CMS' returns a CMS API in top results", () => {
    const results = findApis("add a headless CMS for blog content", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasCms = topSlugs.some((s) =>
      ["contentful", "sanity", "strapi"].includes(s)
    );
    expect(hasCms).toBe(true);
  });

  it("'embed a survey or contact form' returns a forms API", () => {
    const results = findApis("embed a survey or contact form in my app", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasForms = topSlugs.some((s) =>
      ["typeform", "formspark"].includes(s)
    );
    expect(hasForms).toBe(true);
  });

  it("'let users book meetings' returns a scheduling API", () => {
    const results = findApis("let users book meetings and appointments", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasScheduling = topSlugs.some((s) =>
      ["cal-com", "calendly"].includes(s)
    );
    expect(hasScheduling).toBe(true);
  });

  it("'run background jobs' returns a workflow API", () => {
    const results = findApis("run background jobs and async tasks", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasWorkflow = topSlugs.some((s) =>
      ["trigger-dev", "inngest", "temporal"].includes(s)
    );
    expect(hasWorkflow).toBe(true);
  });

  it("'scan for security vulnerabilities' returns a security API", () => {
    const results = findApis("scan my dependencies for security vulnerabilities", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasSecurity = topSlugs.some((s) =>
      ["snyk", "arcjet"].includes(s)
    );
    expect(hasSecurity).toBe(true);
  });

  it("'connect SaaS apps via no-code automation' returns an integration API", () => {
    const results = findApis("connect SaaS apps with no-code automation like Zapier", undefined, 5);
    expect(results.length).toBeGreaterThan(0);
    const topSlugs = results.map((r) => r.entry.slug);
    const hasIntegration = topSlugs.some((s) =>
      ["zapier", "nango"].includes(s)
    );
    expect(hasIntegration).toBe(true);
  });
});
