/**
 * Tests for src/updater/linter.ts
 */

import { describe, it, expect } from "vitest";
import { lintEntry, lintAllEntries } from "../../src/updater/linter.js";
import type { ApiEntry } from "../../src/knowledge/schema.js";

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<ApiEntry> = {}): ApiEntry {
  return {
    slug: "test-api",
    name: "Test API",
    category: "email",
    subcategory: "transactional",
    website: "https://example.com",
    description:
      "A well-described test API that covers all the important details a developer needs to evaluate it.",
    useCases: [
      { task: "send transactional emails", fit: "perfect" },
      { task: "track email opens", fit: "good" },
      { task: "manage subscriber lists", fit: "partial" },
    ],
    auth: {
      method: "api_key",
      setupSteps: ["Create account", "Generate API key", "Set env var"],
      envVarName: "TEST_API_KEY",
      codeSnippet: "const client = new TestClient(process.env.TEST_API_KEY);",
    },
    pricing: {
      model: "freemium",
      freeTier: "1000 emails/month free",
      startingPrice: "$20/month",
      costPer: "$0.001/email after limit",
      pricingUrl: "https://example.com/pricing",
    },
    rateLimits: {
      tier: "free",
      limit: "100/minute",
      notes: "Rate limits apply per account.",
      retryStrategy: "Implement exponential backoff on 429.",
    },
    sdk: {
      primaryLanguage: "typescript",
      installCommand: "npm install --save-exact test-api",
      importStatement: "import { TestClient } from 'test-api';",
      otherLanguages: ["python", "go"],
    },
    codeExamples: [
      {
        title: "Send an email",
        language: "typescript",
        code: [
          "import { TestClient } from 'test-api';",
          "const client = new TestClient(process.env.TEST_API_KEY!);",
          "await client.send({ to: 'user@example.com', subject: 'Hello' });",
          "console.log('sent');",
          "// done",
        ].join("\n"),
        notes: "This example shows how to send a basic email using the TestClient SDK.",
      },
      {
        title: "Track email opens",
        language: "typescript",
        code: [
          "const events = await client.events.list({ type: 'open' });",
          "for (const event of events.items) {",
          "  console.log(event.email, event.openedAt);",
          "}",
          "// end",
        ].join("\n"),
        notes: "Use the events API to track when recipients open emails.",
      },
    ],
    gotchas: [
      "The free tier only allows 1,000 emails per month — this is insufficient for any real production usage.",
      "Rate limits apply per account, not per IP. Exceeding limits triggers a 429 that requires backoff.",
      "The webhook payload format changed in v3. If you are using v2 webhooks, update your handler.",
    ],
    reliability: {
      uptimeGuarantee: "99.9%",
      statusPageUrl: "https://status.example.com",
      notes: "Globally distributed infrastructure.",
    },
    qualityScore: 8,
    qualityJustification:
      "Excellent developer experience with a clean API, strong TypeScript support, and competitive pricing.",
    alternatives: ["sendgrid", "postmark"],
    complementary: ["supabase"],
    bestFor: "Sending transactional emails with high deliverability",
    lastVerified: "2026-02-25",
    entryVersion: 1,
    addedBy: "test",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lintEntry — passing entry", () => {
  it("passes a well-formed entry with no issues", () => {
    const result = lintEntry(makeEntry());
    expect(result.passed).toBe(true);
    const warnErrors = result.issues.filter(
      (i) => i.severity === "error" || i.severity === "warning"
    );
    expect(warnErrors).toHaveLength(0);
  });
});

describe("lintEntry — description quality", () => {
  it("warns on short description", () => {
    const result = lintEntry(makeEntry({ description: "A test API." }));
    const issue = result.issues.find((i) => i.field === "description");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  it("does not warn on adequate description", () => {
    const result = lintEntry(makeEntry());
    const issue = result.issues.find((i) => i.field === "description");
    expect(issue).toBeUndefined();
  });
});

describe("lintEntry — code examples", () => {
  it("warns when only 1 code example", () => {
    const result = lintEntry(
      makeEntry({ codeExamples: [makeEntry().codeExamples[0]!] })
    );
    const issue = result.issues.find(
      (i) => i.field === "codeExamples" && i.message.includes("Only 1")
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  it("does not warn with 2+ examples", () => {
    const result = lintEntry(makeEntry());
    const issue = result.issues.find(
      (i) => i.field === "codeExamples" && i.message.includes("Only 1")
    );
    expect(issue).toBeUndefined();
  });
});

describe("lintEntry — gotchas quality", () => {
  it("warns on very short gotcha", () => {
    const result = lintEntry(
      makeEntry({ gotchas: ["Watch out.", "Be careful.", "Do not do X."] })
    );
    const shortIssues = result.issues.filter(
      (i) => i.field === "gotchas" && i.message.includes("very short")
    );
    expect(shortIssues.length).toBeGreaterThan(0);
  });
});

describe("lintEntry — use cases", () => {
  it("warns when no use case has fit=perfect", () => {
    const result = lintEntry(
      makeEntry({
        useCases: [
          { task: "send emails", fit: "good" },
          { task: "track events", fit: "partial" },
        ],
      })
    );
    const issue = result.issues.find(
      (i) => i.field === "useCases" && i.message.includes("perfect")
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });
});

describe("lintEntry — pricing consistency", () => {
  it("warns when paid model has no startingPrice", () => {
    const result = lintEntry(
      makeEntry({
        pricing: {
          model: "paid",
          freeTier: null,
          startingPrice: null,
          costPer: null,
          pricingUrl: "https://example.com/pricing",
        },
      })
    );
    const issue = result.issues.find((i) => i.field === "pricing.startingPrice");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });
});

describe("lintAllEntries", () => {
  it("sorts entries with most issues first", () => {
    const good = makeEntry({ slug: "good" });
    const bad = makeEntry({
      slug: "bad",
      description: "Short.",
      codeExamples: [makeEntry().codeExamples[0]!],
      useCases: [{ task: "test", fit: "good" }],
    });
    const results = lintAllEntries([good, bad]);
    expect(results[0]!.slug).toBe("bad");
  });

  it("includes all entries in output", () => {
    const entries = [makeEntry({ slug: "a" }), makeEntry({ slug: "b" })];
    const results = lintAllEntries(entries);
    expect(results).toHaveLength(2);
  });
});
