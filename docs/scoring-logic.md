# Scoring Logic

API Oracle ranks APIs using a weighted multi-factor scoring system. This document explains how it works and how to tune it.

## Overview

When `findApis(query, constraints, topN)` is called, the pipeline has 6 steps:

1. **Phrase detection** — extract modifier intent (`preferFree`, `preferOpenSource`, etc.)
2. **Synonym expansion** — `expandQuery()` adds related terms (e.g. "crash" → "error monitoring sentry crash reporting…")
3. **Category detection** — `detectCategory()` maps the query to a known category with a confidence score
4. **Candidate selection** — TF-IDF index pre-ranks all entries; high-confidence category entries are also included
5. **Scoring** — each candidate is scored across 6 weighted dimensions
6. **Confidence** — `computeConfidence()` assesses certainty of the top recommendation

## Scoring Factors

Current weights (must sum to 1.0):

| Factor | Weight | Measures |
|--------|--------|----------|
| `useCaseFit` | 35% | Relevance to the query across multiple fields |
| `qualityScore` | 20% | Curated quality rating (1-10) |
| `developerExperience` | 15% | SDK quality, code examples, auth clarity |
| `pricingFit` | 15% | Pricing model alignment with constraints |
| `keywordRelevance` | 10% | Direct name/slug/subcategory keyword match |
| `recencyBonus` | 5% | How recently the entry was verified |

### 1. Use Case Fit (35%)

Measures relevance using 4 sub-signals:

| Sub-signal | Weight | Description |
|------------|--------|-------------|
| Use case task overlap | 40% | Token overlap between query and each `useCases[].task`; fit multiplier applied (`perfect`=1.0, `good`=0.7, `partial`=0.4); best match wins |
| `bestFor` overlap | 25% | Token overlap with the API's concise purpose statement |
| Description overlap | 20% | Token overlap against first 200 chars of description |
| Category signal match | 15% | Keyword lists per category (e.g. email: `["email", "smtp", "newsletter"…]`) |

The query is tokenized before scoring — stop words are removed, 2+ char tokens are kept. The synonym-expanded query is used, so "crashes" in a query triggers the error tracking category signals.

### 2. Quality Score (20%)

Directly from the curated `qualityScore` field (1-10), normalized to 0-1:

```
quality_raw = (qualityScore - 1) / 9
```

This ensures high-quality APIs (Stripe at 10, Clerk at 9) have a constant advantage, even for fuzzy queries.

### 3. Developer Experience (15%)

Measures ease of integration using objective entry signals:

| Signal | Points |
|--------|--------|
| TypeScript as primary SDK | +3 |
| TypeScript available (not primary) | +1.5 |
| 2+ code examples | +2 |
| 1 code example | +1 |
| `envVarName` defined (clear auth setup) | +1 |
| `installCommand` includes `npm install` | +1 |
| 3+ languages in `otherLanguages` | +1 |
| Required language matches primary *(constraint)* | +2 |
| Required language available *(constraint)* | +1 |

Max = 8 pts (10 pts when `requiredLanguage` constraint is set). Score normalized to 0-1.

### 4. Pricing Fit (15%)

| Condition | Score |
|-----------|-------|
| `preferFree` + `free` or `open_source` model | 1.0 |
| `preferFree` + `freemium` with free tier | 0.85 |
| `preferFree` + `usage_based` | 0.60 |
| `preferFree` + `paid` only | 0.20 |
| No preference + `free` or `open_source` | 0.70 |
| No preference + `freemium` | 0.65 |
| No preference + `usage_based` | 0.60 |
| No preference + `paid` | 0.50 |

Phrase detection can auto-apply `preferFree` from query language (e.g. "cheapest way to send emails").

### 5. Keyword Relevance (10%)

Direct keyword match against the API's name, slug, and subcategory. Rewards queries where the user names an API directly (e.g. "use stripe for payments") or names the subcategory (e.g. "transactional email").

```
score = nameMatch * 0.5 + slugMatch * 0.3 + subCatMatch * 0.2
```

### 6. Recency Bonus (5%)

Entries verified within 30 days → 1.0. Scales linearly to 0 at 365 days.

## Category Boost

After the base score is computed, a category boost is applied if a category was detected with ≥ 0.4 confidence:

```
boosted_score = score * (1 + confidence * 0.12)
```

This gives entries in the correct category up to a 12% boost, helping narrow queries ("real-time chat", "serverless database") beat entries with high quality scores but wrong categories.

## TF-IDF Candidate Selection

Before the scorer runs, a TF-IDF index (built lazily, cached in-memory) pre-ranks all entries for the expanded query. Field weights:

| Field | TF-IDF weight |
|-------|--------------|
| `name` | ×4 |
| `subcategory` | ×3 |
| `bestFor` | ×3 |
| `useCases[].task` | ×2 |
| `description` (first 300 chars) | ×1 |
| `category` | ×1 |

IDF uses Laplace smoothing: `log((N+1)/(df+1)) + 1` — so terms that appear in many documents (like "api" or "data") are downweighted relative to discriminating terms like "transactional" or "geocode".

The top `topN * 8` TF-IDF results are passed to the scorer, along with all category entries for high-confidence category detections.

## Confidence Score

`computeConfidence()` estimates certainty for the top recommendation (0-1, only set on the #1 result):

| Signal | Weight |
|--------|--------|
| `useCaseFit` of top result (0.5+ → full signal) | 40% |
| `detectedConfidence` from category detection | 35% |
| Score separation (gap between rank 1 and 2) | 25% |

Labels: `confidence >= 0.7` → "high", `>= 0.4` → "medium", else "low".

## Score Breakdown

Every result includes a `scoreBreakdown` object (rounded to 2 decimal places):

```json
{
  "useCaseFit": 0.31,
  "qualityScore": 0.89,
  "developerExperience": 1.00,
  "pricingFit": 0.65,
  "keywordRelevance": 0.00,
  "recencyBonus": 0.80,
  "total": 0.62
}
```

The top result also has `confidence: 0.72` and `confidenceLabel: "high"` from `findApis()`.

## Tuning the Weights

Weights are defined in `src/knowledge/scorer.ts`:

```typescript
export const SCORING_WEIGHTS: ScoreWeights = {
  useCaseFit: 0.35,
  qualityScore: 0.20,
  developerExperience: 0.15,
  pricingFit: 0.15,
  keywordRelevance: 0.10,
  recencyBonus: 0.05,
};
```

Weights must sum to exactly 1.0 (tested). To tune:
1. Edit the constants
2. Run `npm test` — scorer tests catch regressions immediately
3. Validate with `npm run analyze` — checks 20 representative queries

**When to tune:**
- Wrong category wins for clear queries → increase `keywordRelevance` or `useCaseFit`
- High-quality irrelevant APIs float up → increase `useCaseFit` relative to `qualityScore`
- TS projects always want TypeScript APIs → increase `developerExperience`
- Free tier matters most → increase `pricingFit`

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty query | Returns `[]` immediately |
| TF-IDF returns 0 results | Falls back to all entries (safety net) |
| Tied scores | Stable sort (consistent ordering) |
| `requiredLanguage` not in SDK | Language signal contributes 0 pts |
| Single entry in database | Returns that entry |
| `topN` > total entries | Returns all entries sorted |
| `lastVerified` not parseable | Recency bonus = 0 |

## Roadmap

- **Graph scoring** — boost APIs frequently used together (via `complementary` field)
- **Popularity signals** — GitHub stars, npm weekly downloads as quality proxy
- **Feedback loop** — track which recommendations developers actually use
- **`list_apis_by_category` tool** — expose category browsing as an MCP tool
