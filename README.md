# API Oracle

An MCP server that gives Claude Code the ability to find, evaluate, and recommend the best API for any programming task.

When a developer asks *"what should I use to send emails?"* — API Oracle returns a structured recommendation with working code, honest gotchas, pricing details, and everything needed to get started immediately.

[![CI](https://github.com/adityanair98/api-oracle/actions/workflows/ci.yml/badge.svg)](https://github.com/adityanair98/api-oracle/actions/workflows/ci.yml)

---

## MCP Tools

| Tool | What it does |
|------|-------------|
| `find_best_api` | Recommends the best API for a task with quick-start code |
| `compare_apis` | Side-by-side comparison of 2–5 APIs |
| `get_api_setup_guide` | Full setup instructions for a specific API |
| `check_api_freshness` | Staleness report showing which entries need re-verification |

## Knowledge Base — 68 APIs across 23 categories

| Category | APIs |
|----------|------|
| AI | Anthropic, OpenAI, Replicate, Resemble AI, Stability AI, ElevenLabs |
| Analytics | PostHog, Sentry |
| Auth | Auth0, Clerk |
| CMS | Contentful, Sanity, Strapi |
| Commerce | Medusa, Shopify API |
| Communication | Sendbird, Stream Chat |
| Database | Firebase, Neon, PlanetScale, Supabase, Upstash |
| DevOps | Fly.io, Netlify, Railway, Vercel |
| Email | Mailgun, Postmark, Resend, SendGrid |
| Forms | Formspark, Typeform |
| Infrastructure | AWS S3, Cloudflare R2, Cloudflare Workers, DigitalOcean Spaces |
| Integration | Nango, Zapier |
| Maps | Google Maps, Mapbox |
| Media | Deepgram, imgix, Mux |
| Messaging | Ably, Pusher, Twilio, Vonage |
| Notifications | Knock, Novu, OneSignal |
| Payments | LemonSqueezy, Paddle, PayPal, Razorpay, Square, Stripe |
| Scheduling | Cal.com, Calendly |
| Search | Algolia |
| Security | Arcjet, Snyk |
| Storage | Cloudinary, UploadThing |
| Testing | BrowserStack, Checkly |
| Workflow | Inngest, Temporal, Trigger.dev |

---

## Quick Start

API Oracle runs as a local MCP server over stdio. There's no setup step. The 68 bundled entries are loaded into an in-memory database when the server starts, and nothing is written to your working directory.

### Claude Code

```bash
claude mcp add api-oracle -- npx -y @adityanair98/api-oracle serve
```

This adds the server to the current project (local scope). To make it available in every project, use `--scope user`:

```bash
claude mcp add --scope user api-oracle -- npx -y @adityanair98/api-oracle serve
```

To check that it's registered, run `claude mcp list`, or `/mcp` inside Claude Code.

On native Windows (not WSL), wrap `npx` with `cmd /c`:

```bash
claude mcp add api-oracle -- cmd /c npx -y @adityanair98/api-oracle serve
```

### Claude Desktop

Claude Desktop reads its MCP servers from `claude_desktop_config.json`. (Claude Code doesn't use this file.)

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server under `mcpServers`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "api-oracle": {
      "command": "npx",
      "args": ["-y", "@adityanair98/api-oracle", "serve"]
    }
  }
}
```

### Run it directly

```bash
npx -y @adityanair98/api-oracle serve       # MCP server on stdio (what the clients above launch)
npx -y @adityanair98/api-oracle dashboard   # web dashboard at http://localhost:3737
npx -y @adityanair98/api-oracle --help
```

Or install it globally with `npm install -g @adityanair98/api-oracle`, then run `api-oracle serve`.

---

## Web Dashboard

API Oracle includes a local web dashboard to browse, search, and manage the knowledge base.

```bash
api-oracle dashboard
# Opens at http://localhost:3737
```

Dashboard features:
- Browse all 68 APIs with search and category filtering
- Quality scores, staleness indicators, pricing info
- Detail modal with full entry: code examples, gotchas, rate limits
- Refresh report — shows which entries need re-verification
- Quality linter — content quality checks beyond schema validation
- Search test tool — inspect score breakdowns for any query

---

## From Source

### 1. Clone and install

```bash
git clone https://github.com/adityanair98/api-oracle.git
cd api-oracle
npm install
```

### 2. Build

```bash
npm run build
```

No seeding step is needed: entries are loaded from `src/entries/` at startup.

### 3. Run

```bash
# MCP server (stdio)
node dist/cli.js serve

# Web dashboard
node dist/cli.js dashboard
```

### Development scripts

```bash
npm run dev            # Run MCP server with tsx (no build needed)
npm test               # Run all tests (226 tests)
npm run validate       # Validate all JSON entries + cross-references
npm run lint-entries   # Content quality linter (0 errors, 15 warnings)
npm run e2e            # End-to-end query scenarios (43 assertions)
npm run eval           # Retrieval accuracy on the dev and held-out query sets
npm run dashboard      # Start dashboard with tsx
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | _(unset)_: in-memory | Optional SQLite file. If it's unset, the bundled entries are loaded into memory at startup. If it's set, they're upserted into that file and other rows are kept. |
| `PORT` | `3737` | Dashboard server port |
| `LOG_LEVEL` | `info` | Log level: debug \| info \| warn \| error |

---

## Adding New APIs

1. Create `src/entries/<category>/<slug>.json`
2. Fill in all schema fields (see `docs/adding-apis.md`)
3. `npm run validate` — verify schema and cross-references
4. Restart the server. Entries are loaded at startup.
5. `npm test` — run tests

See [docs/adding-apis.md](docs/adding-apis.md) for the full guide and JSON template.

---

## Architecture

```
src/
├── cli.ts                # CLI entry point (api-oracle serve|dashboard)
├── index.ts              # MCP server entry point
├── server.ts             # McpServer setup + tool registration
├── tools/                # MCP tool handlers
│   ├── find-api.ts       # find_best_api
│   ├── compare-apis.ts   # compare_apis
│   ├── get-setup-guide.ts# get_api_setup_guide
│   └── check-freshness.ts# check_api_freshness
├── knowledge/            # Core logic
│   ├── schema.ts         # Zod schema + TypeScript types
│   ├── db.ts             # SQLite CRUD (better-sqlite3)
│   ├── loader.ts         # Loads + validates bundled entries at startup
│   ├── relevance.ts      # Query relevance: IDF-weighted coverage, phrases
│   ├── search.ts         # Search pipeline orchestration
│   ├── scorer.ts         # Relevance-gated ranking (relevance × prior)
│   ├── synonyms.ts       # Query expansion + category detection
│   └── tfidf.ts          # TF-IDF index (candidate pre-selection for large KBs)
├── updater/              # Freshness and quality system
│   ├── staleness.ts      # Staleness level detection
│   ├── report.ts         # Freshness report builder
│   ├── linter.ts         # Content quality linter
│   └── version-tracker.ts# Entry version management
├── dashboard/            # Web dashboard
│   ├── server.ts         # Express server
│   ├── routes/api.ts     # REST API routes
│   └── public/           # Vanilla HTML/CSS/JS frontend
├── entries/              # 68 JSON API entries
│   └── <category>/<slug>.json
└── utils/
    ├── logger.ts         # Structured stderr logger
    └── config.ts         # Environment config
```

## How Search Works

Relevance gates the score. An API's quality, developer experience, pricing and freshness can adjust its rank among relevant APIs, but they can't make an unrelated API show up.

1. **Relevance.** This is the IDF-weighted share of your request's words that an entry covers. It checks the entry's name, subcategory, `bestFor` and use cases, with the description counting less. Rare words like "transcription" count more than common ones like "users". Synonyms count partially, and word order counts too, so "speech to text" and "text to speech" give different results.
2. **Category fit.** The request is mapped to a category (email, payments, …). APIs in unrelated categories are down-weighted.
3. **Prior.** A weighted mean of quality score, developer experience, pricing fit and recency. It scales a score between 0.75× and 1.0× of its relevance: `score = relevance × (0.75 + 0.25 × prior)`. If you name an API ("firebase", "send emails with resend"), a small keyword term ranks that API above entries that merely mention it.
4. **Gate.** Candidates below a minimum relevance, below 60% of the best candidate's relevance, or in a clearly unrelated category are dropped.
5. **Response.** `find_best_api` returns the top result with quick-start code, up to 2 alternatives, and `candidates`: up to 5 relevant APIs with key facts and relevance scores, so the calling model can make the final choice. `totalEvaluated` is the number of entries scored.

See [docs/scoring-logic.md](docs/scoring-logic.md) for full details.

## Accuracy

`npm run eval` measures retrieval on two query sets in `tests/eval/`. **dev** (26 queries) is the tuning set. **holdout** (42 queries) was written before the scorer was changed and is never tuned on.

| Scorer | Set | Top-1 | Top-3 | Must-not violations |
|--------|-----|-------|-------|---------------------|
| v0.5.0 | dev | 80.8% | 96.2% | 38.1% |
| v0.5.0 | holdout | **38.1%** | 71.4% | 31.0% |
| v0.6.0 | dev | 96.2% | 100% | 0.0% |
| v0.6.0 | holdout | **92.9%** | 95.2% | 2.4% |

"Must-not violations" is the share of queries with a must-not list (21 of 26 dev queries, all 42 holdout queries) where a clearly wrong API appeared in the top 3. Earlier versions of this project reported 20/20 queries passing. That was measured on the same queries the weights were tuned on, and the held-out top-1 for that scorer was 38.1%.

Caveats: the holdout labels were written from the entries' own descriptions and use cases, which is also what the scorer matches on. Real-world phrasing is likely to score lower. With 42 queries, each one is worth about 2.4 percentage points. Full per-query results are in [`tests/eval/results/`](tests/eval/results/).

## Data freshness

Every entry has a `lastVerified` date: the last time someone checked its pricing, limits and SDK details against the provider's own docs. Dates are only changed when an entry is actually re-verified. Nothing updates them automatically.

- `find_best_api` returns `lastVerified` for every API it lists. For the recommendation it also returns `freshness` (`lastVerified`, `daysSinceVerified`, `level`), plus a `freshnessNote` when the entry isn't fresh.
- Levels: **fresh** < 90 days, **aging** 90–180, **stale** 180–365, **critical** > 365.
- Recency is a small part of the ranking prior (full credit within 30 days, falling to zero at 365 days).
- `check_api_freshness` (MCP tool), `npm run refresh-report` and the dashboard list entries that need re-verification.

As of v0.6.0, all 68 entries were last verified on 2026-02-25, so they report as **stale**. Check pricing and limits on the provider's site before relying on them.

---

## License

MIT
