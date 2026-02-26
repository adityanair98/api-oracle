# Contributing to API Oracle

Thank you for wanting to improve the API Oracle knowledge base. This guide explains how to add new API entries and submit improvements.

## What We Accept

- **New API entries** — any developer-facing API that's publicly available and useful
- **Entry updates** — corrected pricing, updated rate limits, new gotchas discovered
- **Bug fixes** — errors in code examples, broken links, schema issues
- **Synonym improvements** — adding query terms that help discovery

We do NOT accept:
- Proprietary or invitation-only APIs
- APIs with no public documentation
- Duplicate entries (check `src/entries/` first)

## Adding a New Entry

### 1. Create the JSON file

Place it in the appropriate category directory:
```
src/entries/<category>/<slug>.json
```

Available categories: `email`, `payments`, `ai`, `storage`, `search`, `auth`, `messaging`, `analytics`, `database`, `media`, `notifications`, `maps`, `communication`, `devops`, `infrastructure`, `commerce`, `cms`, `forms`, `scheduling`, `testing`, `security`, `workflow`, `integration`

If your API doesn't fit any category, propose a new one in your PR — and update the `category` enum in `src/knowledge/schema.ts`.

### 2. Follow the schema

Every field in `src/knowledge/schema.ts` is required. Key rules:

- **slug**: kebab-case, lowercase, must be unique
- **description**: 100+ chars of useful context (not marketing copy)
- **useCases**: at least 1 with `fit: "perfect"`, 3–4 total recommended
- **codeExamples**: 2+ examples showing different use cases
- **gotchas**: 3+ specific, developer-focused pitfalls (min 2 required)
- **qualityScore**: honest 1-10 with specific justification
- **alternatives/complementary**: only reference slugs that exist in the knowledge base
- **lastVerified**: today's date (YYYY-MM-DD)
- **entryVersion**: 1 for new entries
- **addedBy**: your GitHub username or "contributor"

### 3. Validate your entry

```bash
npm run validate
```

This checks schema compliance and cross-references. Fix all errors before submitting.

### 4. Lint your entry

```bash
npm run lint-entries -- --slug=<your-slug>
```

Address any `error` or `warning` level issues. `info` items are optional improvements.

### 5. Run the tests

```bash
npm run seed    # Load your new entry into the DB
npm test        # All 141+ tests must pass
```

If your entry is for a major category, consider adding a test in `tests/tools/find-api.test.ts` to verify it ranks correctly.

## Entry Quality Bar

The bar for API entries is **high**. Before submitting, confirm:

- [ ] Pricing information is accurate and matches the provider's pricing page today
- [ ] Rate limits are documented from official sources (not guesses)
- [ ] Code examples are complete and actually run (test them!)
- [ ] Gotchas are real pitfalls you or others have actually hit — not generic warnings
- [ ] `qualityScore` is honest — don't score your employer's API a 9 unless it genuinely is
- [ ] `lastVerified` is today's date

## Updating an Existing Entry

If something is out of date or wrong:

1. Edit the JSON file
2. Increment `entryVersion` by 1
3. Update `lastVerified` to today
4. Run `npm run validate` and `npm test`
5. Document what changed in your PR description

## Code Style

- TypeScript strict mode — no `any`
- ESM imports with `.js` extension
- Use `createLogger()` not `console.log`
- Install packages with `--save-exact`

## Pull Request Process

1. Fork the repository and create a branch: `git checkout -b add-<slug>`
2. Make your changes following this guide
3. Ensure `npm run validate`, `npm run lint-entries`, and `npm test` all pass
4. Open a PR with a clear description of what API you're adding and why it belongs
5. A maintainer will review for accuracy and quality
