/**
 * End-to-end test script for the api-oracle knowledge base.
 *
 * Tests 8 real-world query scenarios against the live seeded database.
 * Requires npm run seed to have been run first.
 *
 * Usage: npm run e2e
 */

import { initDb } from "../src/knowledge/db.js";
import { findApis, getApiBySlug, getApisByCategory } from "../src/knowledge/search.js";

// Initialize the live database (requires npm run seed to have been run)
initDb();

interface TestScenario {
  name: string;
  run: () => void;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    process.stdout.write(`    ✓ ${message}\n`);
    passed++;
  } else {
    process.stderr.write(`    ✗ FAIL: ${message}\n`);
    failed++;
  }
}

function scenario(name: string, fn: () => void): void {
  process.stdout.write(`\n  ${name}\n`);
  fn();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Transactional email for a SaaS product
// ─────────────────────────────────────────────────────────────────────────────
scenario("1. 'Send transactional emails for a SaaS product' → email APIs", () => {
  const results = findApis("send transactional emails for a SaaS product", undefined, 3);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["resend", "sendgrid", "postmark"].includes(s)),
    `Top 3 includes an email API (got: ${slugs.join(", ")})`
  );
  assert(results[0].score > 0, "Top result has a positive score");
  assert(
    results[0].entry.category === "email",
    `Top result is email category (got: ${results[0].entry.category})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: India-specific payment processing
// ─────────────────────────────────────────────────────────────────────────────
scenario("2. 'Accept payments in India with UPI' → razorpay over stripe", () => {
  const results = findApis("accept payments in India with UPI", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["razorpay", "stripe"].includes(s)),
    `Top 5 includes a payments API (got: ${slugs.join(", ")})`
  );
  const razorpayIdx = slugs.indexOf("razorpay");
  assert(razorpayIdx >= 0, `Razorpay is in top 5 for India payment query (got: ${slugs.join(", ")})`);
  // Both Stripe and Razorpay should surface for Indian payment queries
  assert(
    slugs.includes("razorpay") && slugs.includes("stripe"),
    "Both razorpay and stripe appear in results"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Real-time WebSocket / chat
// ─────────────────────────────────────────────────────────────────────────────
scenario("3. 'Build a real-time chat feature' → websocket/chat APIs", () => {
  const results = findApis("build a real-time chat feature for my web app", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["pusher", "ably", "stream-chat", "sendbird"].includes(s)),
    `Top 5 includes a real-time/chat API (got: ${slugs.join(", ")})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Serverless database with preferFree constraint
// ─────────────────────────────────────────────────────────────────────────────
scenario("4. 'Serverless Postgres database' with preferFree → supabase/neon/planetscale", () => {
  const results = findApis(
    "serverless Postgres database for my Next.js app",
    { preferFree: true },
    5
  );
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["supabase", "neon", "planetscale", "firebase"].includes(s)),
    `Top 5 includes a database API (got: ${slugs.join(", ")})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Push notifications
// ─────────────────────────────────────────────────────────────────────────────
scenario("5. 'Send push notifications to iOS and Android users' → notification APIs", () => {
  const results = findApis("send push notifications to iOS and Android users", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["onesignal", "knock", "novu"].includes(s)),
    `Top 5 includes a notifications API (got: ${slugs.join(", ")})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Video streaming
// ─────────────────────────────────────────────────────────────────────────────
scenario("6. 'Stream video on demand for an online course platform' → mux", () => {
  const results = findApis("stream video on demand for an online course platform", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const muxResult = results.find((r) => r.entry.slug === "mux");
  assert(muxResult !== undefined, "Mux appears in top 5 results");
  if (muxResult) {
    assert(muxResult.score > 0.4, `Mux has a strong score (got: ${muxResult.score.toFixed(3)})`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Error tracking with getApiBySlug
// ─────────────────────────────────────────────────────────────────────────────
scenario("7. getApiBySlug('sentry') → returns full Sentry entry", () => {
  const entry = getApiBySlug("sentry");
  assert(entry !== null, "Sentry entry found by slug");
  if (entry) {
    assert(entry.name === "Sentry", `Name is 'Sentry' (got: ${entry.name})`);
    assert(entry.category === "analytics", `Category is 'analytics' (got: ${entry.category})`);
    assert(entry.codeExamples.length > 0, "Has at least one code example");
    assert(entry.gotchas.length >= 2, "Has at least 2 gotchas");
    assert(entry.alternatives.includes("posthog"), "PostHog listed as alternative");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Category browsing
// ─────────────────────────────────────────────────────────────────────────────
scenario("8. getApisByCategory('notifications') → returns all 3 notification APIs", () => {
  const entries = getApisByCategory("notifications");
  assert(entries.length === 3, `Returns 3 notification APIs (got: ${entries.length})`);
  const slugs = entries.map((e) => e.slug);
  assert(slugs.includes("onesignal"), "Includes onesignal");
  assert(slugs.includes("knock"), "Includes knock");
  assert(slugs.includes("novu"), "Includes novu");
  // Should be sorted by quality score descending
  for (let i = 0; i < entries.length - 1; i++) {
    assert(
      entries[i].qualityScore >= entries[i + 1].qualityScore,
      `Entry ${entries[i].slug} (${entries[i].qualityScore}) scores ≥ ${entries[i + 1].slug} (${entries[i + 1].qualityScore})`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Synonym expansion — "crashes" → sentry (error tracking)
// Tests Phase 3: synonyms.ts expandQuery maps "crash" → error tracking group
// ─────────────────────────────────────────────────────────────────────────────
scenario("9. 'My app keeps crashing' → synonym expansion hits error tracking", () => {
  const results = findApis("my app keeps crashing in production", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["sentry", "posthog"].includes(s)),
    `Top 5 includes error tracking API (got: ${slugs.join(", ")})`
  );
  // Sentry should rank above non-monitoring APIs for this crash query
  const sentryIdx = slugs.indexOf("sentry");
  assert(sentryIdx >= 0, `Sentry is in top 5 (got: ${slugs.join(", ")})`);
  assert(sentryIdx < 3, `Sentry ranks in top 3 (rank: ${sentryIdx + 1})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Confidence field on top result
// Tests Phase 4: computeConfidence() attaches confidence to findApis() results
// ─────────────────────────────────────────────────────────────────────────────
scenario("10. Results for clear queries include confidence value", () => {
  const results = findApis("send transactional emails", undefined, 3);
  assert(results.length > 0, "Returns at least one result");
  const top = results[0];
  assert(top !== undefined, "Top result exists");
  if (top) {
    assert(
      top.confidence !== undefined,
      `Top result has confidence field (got: ${String(top.confidence)})`
    );
    assert(
      top.confidenceLabel !== undefined,
      `Top result has confidenceLabel (got: ${String(top.confidenceLabel)})`
    );
    assert(
      typeof top.confidence === "number" && top.confidence >= 0 && top.confidence <= 1,
      `Confidence is 0-1 (got: ${String(top.confidence)})`
    );
    assert(
      ["high", "medium", "low"].includes(top.confidenceLabel ?? ""),
      `ConfidenceLabel is high/medium/low (got: ${String(top.confidenceLabel)})`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: TF-IDF recall — multi-word AI query
// Tests Phase 5: TF-IDF pre-ranking surfaces the right candidates
// ─────────────────────────────────────────────────────────────────────────────
scenario("11. 'Generate images from text prompts using AI' → openai/replicate", () => {
  const results = findApis("generate images from text prompts using AI", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["openai", "replicate", "anthropic"].includes(s)),
    `Top 5 includes an AI API (got: ${slugs.join(", ")})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Multi-intent query — supabase handles auth + db + storage
// Tests Phase 3/5: expanded synonym coverage + TF-IDF field weighting
// ─────────────────────────────────────────────────────────────────────────────
scenario("12. 'I need auth, database, and storage for my app' → supabase or firebase", () => {
  const results = findApis("I need auth, database, and storage for my app", undefined, 5);
  assert(results.length > 0, "Returns at least one result");
  const slugs = results.map((r) => r.entry.slug);
  assert(
    slugs.some((s) => ["supabase", "firebase"].includes(s)),
    `Top 5 includes a full-stack BaaS platform (got: ${slugs.join(", ")})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
const total = passed + failed;
process.stdout.write(
  `\n${"─".repeat(60)}\nE2E: ${passed}/${total} assertions passed${failed > 0 ? `, ${failed} FAILED` : ""}\n`
);

if (failed > 0) {
  process.exit(1);
}
