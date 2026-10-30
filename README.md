# API Oracle

An MCP server that gives Claude Code the ability to find, evaluate, and recommend the best API for any programming task.

When a developer asks *"what should I use to send emails?"* — API Oracle returns a structured recommendation with working code, honest gotchas, pricing details, and everything needed to get started immediately.

[![CI](https://github.com/adityanair/api-oracle/actions/workflows/ci.yml/badge.svg)](https://github.com/adityanair/api-oracle/actions/workflows/ci.yml)

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

### Option A — npx (no install)

```bash
npx @adityanair98/api-oracle serve
```

### Option B — global install

```bash
npm install -g @adityanair98/api-oracle
api-oracle serve
```

### Connect to Claude Code

Add to `~/.claude/claude_desktop_config.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "api-oracle": {
      "command": "npx",
      "args": ["@adityanair98/api-oracle", "serve"]
    }
  }
}
```

Restart Claude Code. The `api-oracle` server will appear in your MCP servers list.

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

### 2. Build and seed

```bash
npm run build
npm run seed
```

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
npm test               # Run all tests (160 tests)
npm run validate       # Validate all JSON entries + cross-references
npm run lint-entries   # Content quality linter (0 errors, 15 warnings)
npm run e2e            # End-to-end query scenarios (43 assertions)
npm run dashboard      # Start dashboard with tsx
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./data/api-oracle.db` | SQLite database path |
| `PORT` | `3737` | Dashboard server port |
| `LOG_LEVEL` | `info` | Log level: debug \| info \| warn \| error |

---

## Adding New APIs

1. Create `src/entries/<category>/<slug>.json`
2. Fill in all schema fields (see `docs/adding-apis.md`)
3. `npm run validate` — verify schema and cross-references
4. `npm run seed` — load into database
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
│   ├── search.ts         # Search pipeline orchestration
│   ├── scorer.ts         # Weighted multi-factor ranking engine
│   ├── synonyms.ts       # Query expansion + category detection
│   └── tfidf.ts          # TF-IDF in-memory search index
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

1. **Phrase detection** — extracts `preferFree`, `preferOpenSource`, etc. from natural language
2. **Synonym expansion** — "crashes" → error tracking; "log in" → auth; "billing" → payments
3. **Category detection** — maps query to a category with confidence score
4. **TF-IDF candidate selection** — field-weighted index pre-ranks all 68 entries
5. **Multi-factor scoring** — useCaseFit (40%) + quality (25%) + devExperience (20%) + pricingFit (15%)
6. **Category boost** — entries in the detected category receive up to 12% score boost
7. **Confidence** — top result gets a 0–1 confidence score

See [docs/scoring-logic.md](docs/scoring-logic.md) for full details.

---

## License

MIT
