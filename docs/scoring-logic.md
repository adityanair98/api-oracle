# Scoring Logic

API Oracle ranks APIs using a weighted multi-factor scoring system. This document explains how it works and how to tune it.

## Overview

When `findApis(query, constraints, topN)` is called:

1. **Text search** — SQLite LIKE search narrows the candidate pool (name, description, subcategory, bestFor, useCases, category). If too few results, falls back to all entries.
2. **Scoring** — Each candidate is scored using 4 weighted factors.
3. **Ranking** — Results sorted descending by total score; top N returned.

## Scoring Factors

### 1. Use Case Fit (weight: 40%)

Measures how well the API matches the query.

**Algorithm:**
- Tokenize the query and each `useCases[].task` into lowercase words
- Compute Jaccard-like overlap: `matched_tokens / max(query_size, usecase_size)`
- Apply fit multiplier: `perfect` = 1.0, `good` = 0.7, `partial` = 0.4
- Take the best matching use case score
- Also score category signals (keyword lists per category)
- Final: `60% text_match + 40% category_match`

**Category signals example (email):**
```
["email", "mail", "smtp", "send", "transactional", "newsletter", ...]
```

A query of "send password reset emails" would strongly match the `email` category keywords and overlap with email API use cases.

### 2. Quality Score (weight: 25%)

Directly from the curated `qualityScore` field (1-10), normalized to 0-1.

`quality_raw = (qualityScore - 1) / 9`

This ensures high-quality APIs have a constant advantage in rankings, even for fuzzy queries.

### 3. Developer Experience (weight: 20%)

Measures how easy the API is to use, based on objective signals from the entry.

| Signal | Points |
|--------|--------|
| TypeScript as primary language | +30 |
| TypeScript available (not primary) | +15 |
| Required language matches primary | +20 |
| Required language available | +10 |
| Code examples (per 3) | up to +20 |
| Auth setup ≤ 3 steps | +15 |
| Auth setup ≤ 5 steps | +10 |
| Gotcha/example ratio ≤ 1.5 | +15 |
| Gotcha/example ratio ≤ 3.0 | +8 |

Score normalized by max possible (100 points → 0-1).

### 4. Pricing Fit (weight: 15%)

Score depends on `constraints.preferFree` and the entry's `pricing.model`.

| Condition | Score |
|-----------|-------|
| preferFree + free/open_source | 1.0 |
| preferFree + freemium with tier | 0.85 |
| preferFree + usage_based | 0.6 |
| preferFree + paid only | 0.2 |
| No preference + usage_based | 0.65 |
| No preference + freemium | 0.6 |
| No preference + free | 0.7 |
| No preference + paid | 0.5 |

## Total Score Formula

```
total = useCaseFit * 0.40
      + qualityScore * 0.25
      + devExperience * 0.20
      + pricingFit * 0.15
```

All factor scores are in range [0, 1], so the total is also in [0, 1].

## Score Breakdown

Every result includes a `scoreBreakdown` object:
```json
{
  "useCaseFit": 0.72,
  "qualityScore": 0.89,
  "devExperience": 0.85,
  "pricingFit": 0.85,
  "total": 0.82
}
```

Claude Code uses this to explain its reasoning: "Resend ranks first because it has excellent use case fit for transactional email (0.72) and the highest quality score (0.89)."

## Tuning the Weights

Weights are defined as `DEFAULT_WEIGHTS` in `src/knowledge/scorer.ts`:

```typescript
export const DEFAULT_WEIGHTS: ScoreWeights = {
  useCaseFit: 0.40,
  qualityScore: 0.25,
  devExperience: 0.20,
  pricingFit: 0.15,
};
```

To tune:
1. Edit the constants
2. Run `npm test` — scorer tests will tell you if expected APIs stop ranking correctly
3. Test with real queries using `npm run dev` and calling the tools

**When to tune:**
- If obvious matches aren't appearing in top 3 → increase `useCaseFit`
- If low-quality APIs rank too high → increase `qualityScore`
- If TypeScript APIs aren't ranked high enough for TS projects → increase `devExperience`
- If free tier matters more for your use case → increase `pricingFit`

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty query | Returns empty array, no scoring |
| Text search returns 0 results | Falls back to scoring all 12 entries |
| Tied scores | Stable sort (insertion order preserved) |
| requiredLanguage not in SDK | devExperience receives 0 for language signals |
| Single entry in database | Returns that single entry |
| topN > total entries | Returns all entries sorted |

## V2 Ideas

- **Semantic search**: Replace LIKE with vector embeddings for better query understanding
- **Graph scoring**: Boost APIs that are frequently used together (complementary field)
- **Popularity signals**: GitHub stars, npm downloads as quality signal
- **Live pricing**: Fetch current pricing data from APIs instead of static values
