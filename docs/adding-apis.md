# Adding New API Entries

This guide explains how to add a new API to the API Oracle knowledge base.

## Overview

Each API is a single JSON file stored in `src/entries/<category>/`. The file must conform to the Zod schema defined in `src/knowledge/schema.ts`.

## Step-by-Step

### 1. Choose the right category

Available categories:
- `email` — email delivery (Resend, SendGrid, Postmark)
- `payments` — payment processing (Stripe, Razorpay)
- `ai` — AI/LLM APIs (OpenAI, Anthropic)
- `storage` — file and media storage (Cloudinary, UploadThing)
- `search` — search and indexing (Algolia)
- `auth` — authentication (Clerk, Auth0)
- `messaging` — SMS, chat, webhooks
- `analytics` — event tracking, dashboards
- `database` — hosted databases
- `media` — audio/video processing
- `notifications` — push notifications
- `maps` — geolocation
- `communication` — voice, video

### 2. Create the file

```
src/entries/<category>/<slug>.json
```

The slug must be lowercase kebab-case with no spaces or special characters.
Examples: `resend`, `stripe`, `auth0`, `open-banking`

### 3. Use this template

```json
{
  "name": "API Name",
  "slug": "api-slug",
  "category": "email",
  "subcategory": "transactional-email",
  "website": "https://example.com",
  "description": "2-3 sentences: what does it do and who is it for?",

  "useCases": [
    { "task": "Send transactional emails", "fit": "perfect" },
    { "task": "Send bulk marketing emails", "fit": "partial" }
  ],

  "auth": {
    "method": "api_key",
    "setupSteps": [
      "Step 1: Sign up",
      "Step 2: Get API key",
      "Step 3: Set env var"
    ],
    "envVarName": "MY_API_KEY",
    "codeSnippet": "const client = new MyApi(process.env.MY_API_KEY);"
  },

  "pricing": {
    "model": "freemium",
    "freeTier": "1000 requests/month",
    "startingPrice": "$10/month",
    "costPer": "$0.01 per request",
    "pricingUrl": "https://example.com/pricing"
  },

  "rateLimits": {
    "tier": "free tier",
    "limit": "10 requests/second",
    "notes": "Paid plans have higher limits.",
    "retryStrategy": "Exponential backoff with Retry-After header"
  },

  "sdk": {
    "primaryLanguage": "typescript",
    "installCommand": "npm install --save-exact my-api-sdk",
    "importStatement": "import { MyApi } from 'my-api-sdk';",
    "otherLanguages": ["python", "ruby", "go"]
  },

  "codeExamples": [
    {
      "title": "Basic usage",
      "language": "typescript",
      "code": "// Complete, working code here",
      "notes": "Any important notes about this example"
    }
  ],

  "gotchas": [
    "First real-world pitfall that trips developers up",
    "Second gotcha — must have at least 2"
  ],

  "reliability": {
    "uptimeGuarantee": "99.9% SLA",
    "statusPageUrl": "https://status.example.com",
    "notes": "Notes about reliability and deployment."
  },

  "qualityScore": 8,
  "qualityJustification": "Specific explanation of why this score — mention concrete strengths and weaknesses.",

  "alternatives": ["other-api-slug", "another-api-slug"],
  "complementary": ["often-used-together-slug"],
  "bestFor": "One-line: who should use this and why",

  "lastVerified": "2026-02-25",
  "entryVersion": 1,
  "addedBy": "your-name-or-session-id"
}
```

### 4. Fill in real data

**Research the actual documentation.** Do not guess:
- Pricing: Get exact numbers from the pricing page
- Rate limits: Check API documentation, not blogs
- Code examples: Test that they actually run
- Gotchas: Should be things a developer would actually hit

### 5. Validate

```bash
npm run validate
```

This runs the Zod schema against all JSON files. Fix any errors before proceeding.

### 6. Seed the database

```bash
npm run seed
```

This loads your new entry (and any others) into SQLite. Run this before testing.

### 7. Verify ranking

Add a test to `tests/knowledge/scorer.test.ts`:

```typescript
it("'use case description' ranks my-api in top results", () => {
  const results = rankEntries(allEntries, "use case description", undefined, 5);
  const myApi = results.find((r) => r.entry.slug === "my-api");
  expect(myApi).toBeDefined();
});
```

Run tests: `npm test`

## Validation Checklist

Before submitting a new entry:

- [ ] All required fields are filled in (run `npm run validate` to check)
- [ ] Slug is unique — check `src/entries/` for conflicts
- [ ] Code examples are real and runnable
- [ ] Gotchas are specific and real (not generic)
- [ ] `alternatives` references valid slugs of other entries
- [ ] `lastVerified` is today's date
- [ ] `qualityJustification` explains the score concretely
- [ ] Pricing data matches the current pricing page
- [ ] `useCases[].fit` values accurately reflect the API's actual fit

## Quality Bar

API Oracle's value comes from the quality of its entries. An entry that has:
- Wrong pricing → erodes trust
- Generic gotchas → wastes developer time
- Broken code examples → makes Claude look bad

Take the extra 10 minutes to verify pricing, test the code, and write specific gotchas.
