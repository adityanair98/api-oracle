# API Oracle — CLAUDE.md

## Project Overview

API Oracle is an MCP server that gives Claude Code the ability to find, evaluate, and recommend the best API for any programming task. When a developer asks "what API should I use to send emails?", this server returns a structured recommendation with working code, gotchas, and everything needed to get started immediately.

**Architecture:**
```
Claude Code → MCP tools → search layer → SQLite DB ← seed script ← JSON entries
```

**Current state (v0.4.0):**
- 68 API entries across 23 categories
- 4 MCP tools: find_best_api, compare_apis, get_api_setup_guide, check_api_freshness
- 141 tests passing
- Auto-updater system with staleness tracking and quality linter

## Available npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Run server directly with tsx (no compile needed) |
| `npm test` | Run all tests with Vitest (141 tests) |
| `npm run test:watch` | Watch mode for tests |
| `npm run validate` | Validate all JSON entries against schema + cross-references (CI-safe) |
| `npm run seed` | Load all JSON entries into SQLite database |
| `npm run e2e` | Run end-to-end query scenarios against the live database |
| `npm run analyze` | Score representative queries and show breakdown (requires seeded DB) |
| `npm run refresh-report` | Check entry staleness (--brief, --format=json, --level=stale) |
| `npm run lint-entries` | Lint entry quality (--severity=warning, --slug=<slug>, --summary) |

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
| **TF-IDF** | `src/knowledge/tfidf.ts` | In-memory TF-IDF index for candidate pre-ranking |
| **Search** | `src/knowledge/search.ts` | Pipeline orchestration: phrases → synonyms → TF-IDF → scorer |
| **Scorer** | `src/knowledge/scorer.ts` | Weighted multi-factor ranking (6 dimensions + category boost) |
| **Tools** | `src/tools/*.ts` | MCP tool handlers — format results for Claude |
| **Updater** | `src/updater/*.ts` | Staleness checker, version tracker, report formatter, quality linter |
| **Server** | `src/server.ts` | McpServer setup, tool registration |
| **Entry** | `src/index.ts` | Startup: init DB, start server |
| **Entries** | `src/entries/**/*.json` | API knowledge base (one JSON per API, 68 total) |
| **Scripts** | `scripts/*.ts` | seed-db, validate-entries, e2e-test, scoring-analysis, refresh-report, lint-entries |

## Entry Categories (23 total)

| Category | Examples |
|----------|---------|
| email | resend, sendgrid, postmark, mailgun |
| payments | stripe, paddle, lemonsqueezy, paypal |
| ai | openai, anthropic, stability-ai, eleven-labs |
| storage | cloudinary, uploadthing |
| search | algolia, typesense |
| auth | clerk, auth0 |
| messaging | twilio, vonage, pusher, ably |
| analytics | mixpanel, posthog, segment, amplitude |
| database | supabase, firebase, neon, planetscale, upstash |
| media | cloudinary, mux, deepgram |
| notifications | onesignal, knock, novu |
| maps | google-maps, mapbox |
| communication | stream-chat, sendbird, daily-co |
| devops | vercel, netlify, railway, fly-io |
| infrastructure | aws-s3, cloudflare-r2, cloudflare-workers, digital-ocean-spaces |
| commerce | shopify-api, medusa |
| cms | contentful, sanity, strapi |
| forms | typeform, formspark |
| scheduling | cal-com, calendly |
| testing | browserstack, checkly |
| security | snyk, arcjet |
| workflow | trigger-dev, inngest, temporal |
| integration | zapier, nango |

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

### Step 4: Seed (re-run to add new entries)
```bash
npm run seed
```

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

Tests use in-memory SQLite so there's no filesystem side effect. All tests are in `tests/`.
- `tests/knowledge/` — schema, db, synonyms, TF-IDF, scorer
- `tests/tools/` — MCP tool integration tests (find-api)
- `tests/updater/` — staleness checker, version tracker, linter

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

Weights: useCaseFit (35%) + qualityScore (20%) + devExperience (15%) + pricingFit (15%) + keywordRelevance (10%) + recencyBonus (5%)

Category boost: up to 12% for detected category match.

See `docs/scoring-logic.md` for full details.
