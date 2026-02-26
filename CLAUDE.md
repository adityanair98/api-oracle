# API Oracle — CLAUDE.md

## Project Overview

API Oracle is an MCP server that gives Claude Code the ability to find, evaluate, and recommend the best API for any programming task. When a developer asks "what API should I use to send emails?", this server returns a structured recommendation with working code, gotchas, and everything needed to get started immediately.

**Architecture:**
```
Claude Code → MCP tools → search layer → SQLite DB ← seed script ← JSON entries
```

## Available npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Run server directly with tsx (no compile needed) |
| `npm test` | Run all tests with Vitest |
| `npm run test:watch` | Watch mode for tests |
| `npm run validate` | Validate all JSON entries against schema + cross-references (CI-safe) |
| `npm run seed` | Load all JSON entries into SQLite database |
| `npm run e2e` | Run end-to-end query scenarios against the live database |

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
| **Search** | `src/knowledge/search.ts` | Entry point: text search + scorer pipeline |
| **Scorer** | `src/knowledge/scorer.ts` | Weighted multi-factor ranking algorithm |
| **Tools** | `src/tools/*.ts` | MCP tool handlers — format results for Claude |
| **Server** | `src/server.ts` | McpServer setup, tool registration |
| **Entry** | `src/index.ts` | Startup: init DB, start server |
| **Entries** | `src/entries/**/*.json` | API knowledge base (one JSON per API) |
| **Scripts** | `scripts/*.ts` | seed-db.ts, validate-entries.ts, e2e-test.ts |

## How to Add a New API Entry

### Step 1: Create the JSON file
```
src/entries/<category>/<slug>.json
```
Example: `src/entries/email/mailgun.json`

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

### Step 3: Validate
```bash
npm run validate
```
Fix any errors before proceeding.

### Step 4: Seed (re-run to add new entries)
```bash
npm run seed
```

### Step 5: Test it
Add a test in `tests/knowledge/scorer.test.ts` to verify your entry ranks correctly for its intended queries.

## Testing Instructions

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode during development
```

Tests use in-memory SQLite so there's no filesystem side effect. All tests are in `tests/`.

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

Weights: useCaseFit (40%) + qualityScore (25%) + devExperience (20%) + pricingFit (15%)

See `docs/scoring-logic.md` for full details.
