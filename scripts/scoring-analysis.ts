/**
 * Scoring Analysis Script — runs 20 test queries against the current scorer
 * and identifies where the ranking works well and where it fails.
 *
 * Usage: npm run analyze
 * Requires: npm run seed (needs live database)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 2 BASELINE FINDINGS (before improvements)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sensible: 17/20 queries
 *
 * KEY WEAKNESSES OBSERVED:
 *
 * 1. SYNONYM BLINDNESS — The tokenizer does exact word matching. Queries using
 *    synonyms completely miss the mark:
 *    - "log in with Google and GitHub" → auth tokens ("login", "google") score
 *      well but so do unrelated APIs because "user" appears everywhere
 *    - "my app keeps crashing" → no tokens match "error tracking" or "sentry"
 *    - "something like Firebase but open source" → no meaningful signal at all
 *    - "track how users interact" → "track" matches messaging/analytics weakly
 *
 * 2. STOP-WORD POLLUTION — Common words like "need", "want", "build", "add",
 *    "my", "app" appear everywhere and dilute the Jaccard score across all
 *    entries, making discrimination between categories difficult.
 *
 * 3. CATEGORY SIGNALS TOO NARROW — Category keyword lists are short and miss
 *    many developer terms:
 *    - "crash reporting" not in analytics signals
 *    - "chat" overlaps messaging AND communication
 *    - "backend" doesn't map to database reliably
 *    - "billing" IS in payments signals but "SaaS billing" context gets diluted
 *
 * 4. DESCRIPTION/USE-CASE TEXT NOT SEARCHED — The scorer tokenizes against
 *    use case tasks only. Rich context in descriptions, bestFor, gotchas is
 *    ignored entirely.
 *
 * 5. FUZZY INTENT NOT HANDLED — "I need everything — auth, database, storage"
 *    is a multi-intent query. Current scorer picks a random winner based on
 *    whichever single token happens to match best. Supabase (which does all
 *    three) should win but won't based on token overlap alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 6 RESULTS (after Phases 3–5 improvements)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sensible: 20/20 queries (up from 17/20)
 *
 * IMPROVEMENTS:
 * 1. SYNONYM EXPANSION (Phase 3) — expandQuery() adds related terms before
 *    scoring. "crashes" now triggers "error tracking"; "log in" triggers "auth";
 *    "billing" triggers "payment". Resolved synonym blindness for all 4 failing
 *    queries from Phase 2.
 *
 * 2. TF-IDF CANDIDATE SELECTION (Phase 5) — replaced SQLite LIKE search with
 *    in-memory TF-IDF index. Field weighting (name x4, subcategory x3, etc.)
 *    gives precise initial candidate pools. Improved recall for multi-word
 *    queries that LIKE would miss.
 *
 * 3. CATEGORY BOOST (Phase 3/4) — detectCategory() + applyCategoryBoost() in
 *    scorer gives up to 12% boost to entries in the detected category. Helps
 *    with vague queries like "I need AI in my app" or "real-time anything".
 *
 * 4. MULTI-INTENT QUERIES — "I need everything — auth, database, storage" now
 *    surfaces supabase in top 2 (it covers all three use cases).
 *
 * REMAINING GAPS:
 * - mux still appears in payment/auth result sets (high quality score + low
 *   useCaseFit means it floats up when topN field competitors are weak)
 * - "real-time anything" returns stream-chat as #1 but not pusher/ably
 * - score gaps between winner and runner-up are narrow (0.01–0.05 range)
 *   indicating the scorer is not very confident for vague queries
 */

import { initDb } from "../src/knowledge/db.js";
import { findApis } from "../src/knowledge/search.js";
import type { RankedResult } from "../src/knowledge/search.js";

// Initialize live database
initDb();

// ─── Query definitions ────────────────────────────────────────────────────────

interface TestQuery {
  query: string;
  category: string;
  expectedSlugs: string[]; // At least one should appear in top 3
  note?: string;
}

const QUERIES: TestQuery[] = [
  // STRAIGHTFORWARD — should already work well
  {
    category: "STRAIGHTFORWARD",
    query: "send transactional emails",
    expectedSlugs: ["resend", "sendgrid", "postmark"],
  },
  {
    category: "STRAIGHTFORWARD",
    query: "process credit card payments",
    expectedSlugs: ["stripe", "razorpay"],
  },
  {
    category: "STRAIGHTFORWARD",
    query: "user authentication for web app",
    expectedSlugs: ["clerk", "auth0"],
  },
  {
    category: "STRAIGHTFORWARD",
    query: "store files and images",
    expectedSlugs: ["cloudinary", "uploadthing", "imgix"],
  },
  {
    category: "STRAIGHTFORWARD",
    query: "full-text search for my app",
    expectedSlugs: ["algolia"],
  },

  // FUZZY / NATURAL LANGUAGE — likely weaker
  {
    category: "FUZZY",
    query: "my users need to log in with Google and GitHub",
    expectedSlugs: ["clerk", "auth0"],
    note: "OAuth/social login intent — 'log in', 'Google', 'GitHub' not in use case tasks",
  },
  {
    category: "FUZZY",
    query: "I want to add a chat feature to my app",
    expectedSlugs: ["pusher", "ably", "stream-chat", "sendbird"],
    note: "'chat' maps to communication/messaging — test if it disambiguates",
  },
  {
    category: "FUZZY",
    query: "need to know when my app crashes in production",
    expectedSlugs: ["sentry"],
    note: "'crashes' → error tracking — synonym blindness expected",
  },
  {
    category: "FUZZY",
    query: "let users upload profile pictures",
    expectedSlugs: ["cloudinary", "uploadthing", "imgix"],
    note: "'profile pictures' = image upload/storage",
  },
  {
    category: "FUZZY",
    query: "send an SMS when someone places an order",
    expectedSlugs: ["twilio", "vonage"],
    note: "SMS is in messaging signals but 'order' adds noise",
  },

  // CONTEXT-DEPENDENT — requires understanding intent
  {
    category: "CONTEXT",
    query: "I'm building a SaaS and need billing",
    expectedSlugs: ["stripe", "razorpay"],
    note: "'billing' IS in payments signals — should work",
  },
  {
    category: "CONTEXT",
    query: "I need a backend for my mobile app",
    expectedSlugs: ["supabase", "firebase"],
    note: "'backend' is vague — BaaS platforms should surface",
  },
  {
    category: "CONTEXT",
    query: "I want to track how users interact with my product",
    expectedSlugs: ["posthog", "sentry"],
    note: "'track' + 'users' + 'product' = analytics/product analytics",
  },
  {
    category: "CONTEXT",
    query: "I need to store data but I'm on Vercel",
    expectedSlugs: ["supabase", "neon", "planetscale", "upstash"],
    note: "'Vercel' context → serverless/edge-compatible databases",
  },
  {
    category: "CONTEXT",
    query: "I need AI in my app",
    expectedSlugs: ["openai", "anthropic"],
    note: "Very vague AI query — category signal 'AI' should save it",
  },

  // EDGE CASES
  {
    category: "EDGE",
    query: "cheapest way to send emails",
    expectedSlugs: ["resend", "sendgrid", "postmark"],
    note: "'cheapest' = preferFree signal — email APIs should surface",
  },
  {
    category: "EDGE",
    query: "most reliable payment processor",
    expectedSlugs: ["stripe", "razorpay"],
    note: "'reliable' not in scoring — quality score should compensate",
  },
  {
    category: "EDGE",
    query: "real-time anything",
    expectedSlugs: ["pusher", "ably", "supabase"],
    note: "Very vague real-time query — 'real-time' should trigger messaging",
  },
  {
    category: "EDGE",
    query: "I need everything — auth, database, storage",
    expectedSlugs: ["supabase", "firebase"],
    note: "Multi-intent — supabase does all three but may not win on any single token",
  },
  {
    category: "EDGE",
    query: "something like Firebase but open source",
    expectedSlugs: ["supabase", "novu"],
    note: "'Firebase' reference + 'open source' modifier — complex reasoning needed",
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

function formatBreakdown(r: RankedResult): string {
  const b = r.scoreBreakdown;
  return `useFit=${b["useCaseFit"]?.toFixed(2) ?? "?"} qual=${b["qualityScore"]?.toFixed(2) ?? "?"} dx=${b["developerExperience"]?.toFixed(2) ?? "?"} price=${b["pricingFit"]?.toFixed(2) ?? "?"} total=${b["total"]?.toFixed(3) ?? r.score.toFixed(3)}`;
}

let sensibleCount = 0;
let currentCategory = "";

for (const { category, query, expectedSlugs, note } of QUERIES) {
  if (category !== currentCategory) {
    process.stdout.write(`\n${"─".repeat(70)}\n${category}\n${"─".repeat(70)}\n`);
    currentCategory = category;
  }

  const results = findApis(query, undefined, 3);
  const topSlugs = results.map((r) => r.entry.slug);
  const isSensible = topSlugs.some((s) => expectedSlugs.includes(s));

  if (isSensible) sensibleCount++;

  const flag = isSensible ? "✓" : "✗";
  process.stdout.write(`\n${flag} "${query}"\n`);
  if (note) {
    process.stdout.write(`  NOTE: ${note}\n`);
  }
  process.stdout.write(`  Expected one of: ${expectedSlugs.join(", ")}\n`);

  if (results.length === 0) {
    process.stdout.write(`  (no results returned)\n`);
  } else {
    results.forEach((r, i) => {
      process.stdout.write(
        `  ${i + 1}. ${r.entry.slug.padEnd(16)} [${formatBreakdown(r)}]\n`
      );
    });
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

process.stdout.write(`\n${"═".repeat(70)}\n`);
process.stdout.write(`SCORING ANALYSIS SUMMARY\n`);
process.stdout.write(`${"═".repeat(70)}\n`);
process.stdout.write(`Sensible results: ${sensibleCount}/${QUERIES.length}\n\n`);

const failed = QUERIES.filter((q, i) => {
  const results = findApis(q.query, undefined, 3);
  const topSlugs = results.map((r) => r.entry.slug);
  return !topSlugs.some((s) => q.expectedSlugs.includes(s));
});

if (failed.length > 0) {
  process.stdout.write(`Queries needing improvement:\n`);
  for (const q of failed) {
    process.stdout.write(`  ✗ "${q.query}" (expected: ${q.expectedSlugs.join(", ")})\n`);
  }
}
