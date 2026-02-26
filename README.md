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
npm test           # Run unit tests (56 tests)
npm run validate   # Validate all JSON entries + cross-references
npm run seed       # Seed database
npm run e2e        # Run 8 end-to-end query scenarios
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
│   ├── search.ts         # Search entry point
│   └── scorer.ts         # Weighted ranking engine
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

## Roadmap (V0.3+)

- **Semantic search** — vector embeddings for better query understanding (replace LIKE)
- **More APIs** — Datadog, Stripe Billing, Twilio Segment, Cloudflare Workers KV, etc.
- **Live validation** — periodically verify pricing/rate limits are still accurate
- **Graph relationships** — boost APIs commonly used together
- **Category browsing** — new tool: `list_apis_by_category`
- **Feedback loop** — track which recommendations developers actually use
