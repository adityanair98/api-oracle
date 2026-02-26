# API Oracle

An MCP server that gives Claude Code the ability to find, evaluate, and recommend the best API for any programming task.

When a developer asks *"what should I use to send emails?"* — API Oracle returns a structured recommendation with working code, honest gotchas, pricing details, and everything needed to get started immediately.

## What It Does

Exposes 3 MCP tools to Claude Code:

| Tool | Description |
|------|-------------|
| `find_best_api` | Recommend the best API for a task with quick-start code |
| `compare_apis` | Side-by-side comparison of 2-5 APIs |
| `get_api_setup_guide` | Complete setup instructions for a specific API |

## Knowledge Base

35 curated API entries across 13 categories:

| Category | APIs |
|----------|------|
| Email | Resend, SendGrid, Postmark |
| Payments | Stripe, Razorpay |
| AI | OpenAI, Anthropic, Replicate, Resemble AI |
| Storage | Cloudinary, UploadThing |
| Auth | Clerk, Auth0 |
| Search | Algolia |
| Messaging | Twilio, Vonage, Pusher, Ably |
| Communication | Stream Chat, Sendbird |
| Database | Supabase, Firebase, PlanetScale, Upstash, Neon |
| Media | Mux, Deepgram, imgix |
| Maps | Mapbox, Google Maps Platform |
| Notifications | OneSignal, Knock, Novu |
| Analytics | Sentry, PostHog |

## Quick Start

### 1. Install dependencies

```bash
node --version  # Must be >= 24.x (see .nvmrc)
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Seed the database

```bash
npm run seed
```

### 4. Connect to Claude Code

Add to `~/.claude/claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "api-oracle": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/api-oracle"
    }
  }
}
```

### 5. Restart Claude Code

The `api-oracle` server will now appear in your MCP servers list.

## Development

```bash
npm run dev        # Run with tsx (no build needed)
npm test           # Run unit tests (104 tests)
npm run validate   # Validate all JSON entries + cross-references
npm run seed       # Seed database
npm run e2e        # Run 12 end-to-end query scenarios (43 assertions)
npm run analyze    # Score 20 representative queries and show breakdown
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./data/api-oracle.db` | SQLite database file location |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `NODE_ENV` | `development` | Environment |

## Adding New APIs

1. Create `src/entries/<category>/<slug>.json`
2. Fill in all schema fields (see `docs/adding-apis.md`)
3. `npm run validate` — verify schema and cross-references
4. `npm run seed` — load into database
5. `npm test` — run tests

See [docs/adding-apis.md](docs/adding-apis.md) for the full guide and JSON template.

## Architecture

```
src/
├── index.ts              # Entry point
├── server.ts             # McpServer setup + tool registration
├── tools/                # MCP tool handlers
│   ├── find-api.ts       # find_best_api
│   ├── compare-apis.ts   # compare_apis
│   └── get-setup-guide.ts# get_api_setup_guide
├── knowledge/            # Core logic
│   ├── schema.ts         # Zod schema + TypeScript types
│   ├── db.ts             # SQLite CRUD (better-sqlite3)
│   ├── search.ts         # Search entry point (pipeline orchestration)
│   ├── scorer.ts         # Weighted multi-factor ranking engine
│   ├── synonyms.ts       # Query expansion, phrase detection, category detection
│   └── tfidf.ts          # TF-IDF in-memory search index
├── entries/              # API knowledge base (35 JSON files)
│   ├── ai/               # openai, anthropic, replicate, resemble-ai
│   ├── analytics/        # sentry, posthog
│   ├── auth/             # clerk, auth0
│   ├── communication/    # stream-chat, sendbird
│   ├── database/         # supabase, firebase, planetscale, upstash, neon
│   ├── email/            # resend, sendgrid, postmark
│   ├── maps/             # mapbox, google-maps
│   ├── media/            # mux, deepgram, imgix
│   ├── messaging/        # twilio, vonage, pusher, ably
│   ├── notifications/    # onesignal, knock, novu
│   ├── payments/         # stripe, razorpay
│   ├── search/           # algolia
│   └── storage/          # cloudinary, uploadthing
└── utils/
    ├── logger.ts         # Structured stderr logger
    └── config.ts         # Environment config
```

See [docs/scoring-logic.md](docs/scoring-logic.md) for how the ranking algorithm works.

## How Search Works (v0.3)

1. **Phrase detection** — extracts `preferFree`, `preferOpenSource`, etc. from natural language
2. **Synonym expansion** — "crashes" → error tracking; "log in" → auth; "billing" → payments
3. **Category detection** — maps query to a category with confidence score
4. **TF-IDF candidate selection** — field-weighted index pre-ranks all 35 entries; no LIKE queries
5. **Multi-factor scoring** — 6 dimensions: useCaseFit (35%), quality (20%), devExperience (15%), pricingFit (15%), keywords (10%), recency (5%)
6. **Category boost** — entries in the detected category receive up to 12% score boost
7. **Confidence** — top result gets a 0-1 confidence score with "high/medium/low" label

Result: **20/20 scoring analysis queries return sensible results** (up from 17/20 in v0.2).

## Roadmap (V0.4+)

- **More APIs** — Datadog, Cloudflare Workers KV, Resend v2 webhooks, etc.
- **`list_apis_by_category` tool** — expose category browsing as a new MCP tool
- **Graph scoring** — boost APIs commonly used together (via `complementary` field)
- **Popularity signals** — GitHub stars, npm downloads as quality proxy
- **Live validation** — periodically verify pricing/rate limits are still accurate
