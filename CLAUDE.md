# API Oracle — CLAUDE.md

## Project Overview

API Oracle is an MCP server that gives Claude Code the ability to find, evaluate, and recommend the best API for any programming task. When a developer asks "what API should I use to send emails?", this server returns a structured recommendation with working code, gotchas, and everything needed to get started immediately.

**Architecture:**
```
Claude Code → MCP tools → search layer → SQLite DB (in-memory) ← loader (at startup) ← bundled JSON entries
```

**Current state (v0.6.0):**
- 68 API entries across 23 categories, loaded into an in-memory SQLite DB at startup
- 4 MCP tools: find_best_api, compare_apis, get_api_setup_guide, check_api_freshness
- Web dashboard at http://localhost:3737 (`npm run dashboard`)
- CLI entry point: `api-oracle serve|dashboard`
- 228 tests passing; retrieval eval via `npm run eval` (dev + held-out sets)
- Auto-updater system with staleness tracking and quality linter

## Available npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to `dist/` + copy `src/dashboard/public` to `dist/` |
| `npm run dev` | Run MCP server directly with tsx (no compile needed) |
| `npm test` | Run all tests with Vitest (228 tests) |
| `npm run test:watch` | Watch mode for tests |
| `npm run validate` | Validate all JSON entries against schema + cross-references (CI-safe) |
| `npm run seed` | Optional: write the entries to a SQLite file (`./data/api-oracle.db` or `DB_PATH`). Not needed to run the server |
| `npm run e2e` | Run end-to-end query scenarios (loads bundled entries in memory) |
| `npm run analyze` | Score representative queries and show breakdown (loads bundled entries in memory) |
| `npm run eval` | Retrieval accuracy (top-1, top-3, must-not violations) on tests/eval/dev.json and holdout.json. Tune on dev only |
| `npm run refresh-report` | Check entry staleness (--brief, --format=json, --level=stale) |
| `npm run lint-entries` | Lint entry quality (--severity=warning, --slug=<slug>, --summary) |
| `npm run dashboard` | Start web dashboard at http://localhost:3737 |

## Code Conventions

- **TypeScript strict mode** — zero `any` types allowed; all parameters and return types must be explicit
- **ESM modules** — `import/export` only; never `require()`; all internal imports must use `.js` extension
- **Exact versions** — all npm packages installed with `--save-exact`; no `^` or `~` ever
- **Zod for all validation** — entry schema, tool inputs, runtime data all validated with Zod
- **No console.log** — use `createLogger(namespace)` from `src/utils/logger.ts`; logs go to stderr
- **No external logging deps** — logger uses only `process.stderr`

## Architecture: Which Layer Does What

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Schema** | `src/knowledge/schema.ts` | Zod schema + TypeScript types for API entries |
| **Database** | `src/knowledge/db.ts` | SQLite CRUD via better-sqlite3 |
| **Synonyms** | `src/knowledge/synonyms.ts` | Query expansion, phrase detection, category detection |
| **TF-IDF** | `src/knowledge/tfidf.ts` | In-memory TF-IDF index; candidate pre-selection only when the KB exceeds 500 entries |
| **Search** | `src/knowledge/search.ts` | Pipeline: phrase + category detection → score all entries → relevance gate (`RELEVANCE_GATE`) |
| **Relevance** | `src/knowledge/relevance.ts` | Query relevance: IDF-weighted coverage of query words + ordered word pairs |
| **Scorer** | `src/knowledge/scorer.ts` | relevance = min(coverage + keyword bonus, 1) × categoryFit; score = relevance × (0.75 + 0.25 × prior) + keyword term |
| **Loader** | `src/knowledge/loader.ts` | Loads + validates bundled entries at startup (resolved via import.meta.url) |
| **Tools** | `src/tools/*.ts` | MCP tool handlers — format results for Claude |
| **Updater** | `src/updater/*.ts` | Staleness checker, version tracker, report formatter, quality linter |
| **Dashboard** | `src/dashboard/` | Express web dashboard — REST API + vanilla JS/CSS/HTML frontend |
| **CLI** | `src/cli.ts` | `api-oracle serve|dashboard` CLI entry point |
| **Server** | `src/server.ts` | McpServer setup, tool registration |
| **Entry** | `src/index.ts` | MCP startup: load knowledge base, start server |
| **Entries** | `src/entries/**/*.json` | API knowledge base (one JSON per API, 68 total) |
| **Scripts** | `scripts/*.ts` | seed-db, validate-entries, e2e-test, scoring-analysis, eval, refresh-report, lint-entries |

## Entry Categories (23 total)

| Category | Entries |
|----------|---------|
| email | mailgun, postmark, resend, sendgrid |
| payments | lemonsqueezy, paddle, paypal, razorpay, square, stripe |
| ai | anthropic, eleven-labs, openai, replicate, resemble-ai, stability-ai |
| storage | cloudinary, uploadthing |
| search | algolia |
| auth | auth0, clerk |
| messaging | ably, pusher, twilio, vonage |
| analytics | posthog, sentry |
| database | firebase, neon, planetscale, supabase, upstash |
| media | deepgram, imgix, mux |
| notifications | knock, novu, onesignal |
| maps | google-maps, mapbox |
| communication | sendbird, stream-chat |
| devops | fly-io, netlify, railway, vercel |
| infrastructure | aws-s3, cloudflare-r2, cloudflare-workers, digital-ocean-spaces |
| commerce | medusa, shopify-api |
| cms | contentful, sanity, strapi |
| forms | formspark, typeform |
| scheduling | cal-com, calendly |
| testing | browserstack, checkly |
| security | arcjet, snyk |
| workflow | inngest, temporal, trigger-dev |
| integration | nango, zapier |

## How to Add a New API Entry

### Step 1: Create the JSON file
```
src/entries/<category>/<slug>.json
```
If adding a new category, first add it to the `category` enum in `src/knowledge/schema.ts`.

### Step 2: Fill in all required fields
Use the schema in `src/knowledge/schema.ts` as your guide. Required fields:
- `name`, `slug` (kebab-case), `category`, `subcategory`, `website`, `description`
- `useCases` (min 1, with `task` and `fit`)
- `auth` (method, setupSteps, envVarName, codeSnippet)
- `pricing` (model, freeTier, startingPrice, costPer, pricingUrl)
- `rateLimits` (tier, limit, notes, retryStrategy)
- `sdk` (primaryLanguage, installCommand, importStatement, otherLanguages)
- `codeExamples` (min 1, with title, language, code, notes)
- `gotchas` (min 2)
- `reliability` (uptimeGuarantee, statusPageUrl, notes)
- `qualityScore` (1-10), `qualityJustification`
- `alternatives`, `complementary`, `bestFor`
- `lastVerified` (YYYY-MM-DD), `entryVersion`, `addedBy`

**Cross-references:** Only use slugs from existing entries in `alternatives` and `complementary`. Run `npm run validate` to catch invalid references.

### Step 3: Validate
```bash
npm run validate
```
Fix any errors before proceeding.

### Step 4: Restart the server
Entries are loaded from `src/entries/` at startup, so a restart picks up new or edited entries. No seeding step is needed.

### Step 5: Lint and test
```bash
npm run lint-entries -- --slug=<your-slug>   # check quality
npm test                                      # run all tests
```

## Testing Instructions

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode during development
```

Unit tests use in-memory SQLite. `tests/cli/` runs `npm run build` (which starts with `rm -rf dist`) and uses temp dirs, so `npm test` rewrites `dist/`. Don't run it alongside a build or anything that uses `dist/`. All tests are in `tests/`.
- `tests/knowledge/` — schema, db, loader, synonyms, TF-IDF, relevance, scorer
- `tests/cli/` — builds the package and runs `dist/cli.js` from an empty temp folder (serve over MCP stdio, dashboard over HTTP)
- `tests/eval/` — eval query sets, harness tests, saved results (`npm run eval` is the measurement)
- `tests/docs/` — README setup / badge / version consistency guards
- `tests/utils/` — logger (LOG_LEVEL)
- `tests/tools/` — MCP tool integration tests (find-api)
- `tests/updater/` — staleness checker, version tracker, linter
- `tests/dashboard/` — dashboard REST API integration tests (all 8 endpoints)

## Auto-Updater System

The `src/updater/` module provides staleness tracking and quality enforcement:

```bash
npm run refresh-report             # Full markdown staleness report
npm run refresh-report -- --brief  # One-line summary
npm run refresh-report -- --format=json  # JSON output
npm run lint-entries               # Full quality lint
npm run lint-entries -- --summary  # Summary only
npm run lint-entries -- --severity=warning  # Warnings+
```

**Staleness thresholds:**
- ✅ Fresh: verified < 90 days ago
- 🟡 Aging: 90–180 days ago
- 🟠 Stale: 180–365 days ago
- 🔴 Critical: > 365 days ago

## Quality Standard for API Entries

A high-quality entry must have:
1. **Real data** — actual pricing, actual rate limits (not guesses)
2. **Working code** — copy-pasteable TypeScript that actually runs
3. **Honest gotchas** — real-world pitfalls a developer would hit, not generic warnings
4. **Accurate fit** — `useCases[].fit` reflects reality ("perfect" means ideal, not just "works")
5. **Up-to-date** — `lastVerified` within the past 6 months; update when things change
6. **Specific justification** — `qualityJustification` explains the score concretely

**Score guidelines:**
- 9-10: Best-in-class, exceptional DX, widely trusted
- 7-8: Good quality, some friction or limitations
- 5-6: Works but notable rough edges or limited use cases
- 1-4: Only for specific niche use cases or significant issues

## Scoring Algorithm (Summary)

Relevance gates the score: `relevance = min(coverage + keyword bonus, 1) × categoryFit`; `score = relevance × (0.75 + 0.25 × prior) + keywordRelevance × 0.10 × categoryFit`.
- coverage: IDF-weighted coverage of the query's words (name/subcategory/bestFor/perfect+good use cases; description 0.6; synonyms 0.4; `partial` use cases ignored as known poor fits) plus ordered word pairs; product names match exactly, never by prefix
- prior: quality 0.20, devExperience 0.15, pricingFit 0.15, recency 0.05 (relative weights from `SCORING_WEIGHTS`)
- gate (on relevance, after categoryFit): drop relevance < 0.2, < 0.6 × best, or clearly unrelated category

Measure every change with `npm run eval`; tune on `tests/eval/dev.json` only, never on `holdout.json`.

See `docs/scoring-logic.md` for full details.
