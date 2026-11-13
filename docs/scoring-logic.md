# Scoring Logic

How `find_best_api` decides what to recommend. The code is in `src/knowledge/relevance.ts`, `scorer.ts` and `search.ts`.

## Overview

**Relevance gates the score.** Quality, developer experience, pricing and recency don't depend on the query. They can adjust an entry that is already relevant, but they can't make an unrelated API rank. (In v0.5.0 they were 55% of an additive score, which is why Stripe showed up for image and email queries.)

```
relevance = min(coverage + keyword bonus, 1) × categoryFit       ∈ [0, 1]
prior     = weighted mean(quality, DX, pricing, recency)         ∈ [0, 1]
score     = relevance × (0.75 + 0.25 × prior)
            + keywordRelevance × 0.10 × categoryFit             (user named the API)
```

Next, `findApis` drops every candidate that fails the relevance gate (see [Gating](#gating)). The top 3 that survive become the recommendation and the alternatives. The top 5 are returned as `candidates`.

## 1. Coverage (`relevance.ts`)

Coverage is the IDF-weighted share of the query's words that an entry covers.

1. **Query concepts.** The query is tokenised. Filler words ("need", "know", "app"), preference modifiers ("cheapest", "reliable": these are handled by constraints) and domain-generic words ("api", "sdk") are dropped. Each remaining word is a concept. Each ordered word pair ("speech text") is also a concept, at half weight. That's how "speech to text" can be told apart from "text to speech".
2. **Matching.** A concept counts as covered by the best field it appears in:

   | Field | Weight |
   |-------|--------|
   | name, slug, subcategory, bestFor, `perfect` use cases | 1.0 |
   | `good` use cases | 0.8 |
   | description, category | 0.6 |
   | `partial` use cases | **ignored** |

   In this knowledge base, `partial` marks known poor fits. Examples: Anthropic's "Generate images or audio", Twilio's "Send transactional emails", Stripe's "Process payments in emerging markets like India".
   A word matches by light prefix stemming ("image" ~ "images", "transcribe" ~ "transcription", but not "store" ~ "storefront"). Product names in entry names (openai, auth0, uploadthing, cal…) only match exactly, so "open source" never counts as "OpenAI" and "calls" never counts as "Cal.com". A match that only comes through a synonym group (`synonyms.ts`) earns 0.4 of the field weight. Brand names inside synonym groups (stripe, twilio, mux…) are never used as synonyms.
3. **IDF.** Each concept is weighted by `log((N+1)/(df+1)) + 1` over the entries being ranked, so specific words ("transcription", "resize") outweigh generic ones ("users", "data"). A word that no entry matches keeps weight 1.0. That way a query made mostly of unknown words gets low relevance everywhere, instead of a perfect score for its one known word.

## 2. Keyword signal

If the user names an API or its subcategory ("algolia", "transactional email"), `keywordRelevance` (overlap of the original query with the entry's name, slug and subcategory) is used twice:

- `keywordRelevance × (0.10 / 0.35)` is added to coverage before the clamp at 1. This affects gating.
- `keywordRelevance × 0.10 × categoryFit` is added to the final score, outside the clamp. Without this term, a query like "firebase" ties Firebase with entries that merely mention it (Supabase: "the open-source Firebase alternative"), and the tie goes to the better prior.

## 3. Category fit

`detectCategory()` maps the query to a category with a confidence score. When the confidence is at least 0.4, relevance is multiplied by:

| Entry category vs detected | Factor |
|----------------------------|--------|
| same | 1.0 |
| related (`CATEGORY_AFFINITY`, e.g. storage ↔ infrastructure ↔ media) | 0.9 |
| unrelated | 0.7 |

## 4. Prior

Weighted mean of four query-independent factors. Their relative weights come from `SCORING_WEIGHTS`:

| Factor | Weight in prior | Computation |
|--------|-----------------|-------------|
| Quality | 0.20 / 0.55 | `(qualityScore − 1) / 9` |
| Developer experience | 0.15 / 0.55 | TypeScript SDK (3), 2+ code examples (2), env var (1), npm install (1), 3+ other SDKs (1); +2 for `requiredLanguage` match |
| Pricing fit | 0.15 / 0.55 | free/open source 0.70, freemium 0.65, usage-based 0.60, paid 0.50; with `preferFree`: 1.0 / 0.85 / 0.60 / 0.20 |
| Recency | 0.05 / 0.55 | 1.0 if verified within 30 days, linear to 0 at 365 days |

`PRIOR_INFLUENCE = 0.25`: the prior scales a score between 0.75× and 1.0× of its relevance, so the worst prior costs at most 25% of the score. An entry with zero relevance (and no keyword match) scores zero.

## Gating

`RELEVANCE_GATE` in `search.ts`. A candidate is kept only if:

- relevance ≥ **0.2**, and
- relevance ≥ **0.6 ×** the best candidate's relevance, and
- it isn't in an unrelated category (factor 0.7) while the category was detected with confidence ≥ 0.5, unless its own relevance is ≥ 0.6.

The trade-off: a strict gate removes irrelevant alternatives but can leave only 1 or 2 candidates for narrow queries. Algolia, for example, is the only search API. That's intended: `candidates` lists only entries that are actually relevant.

## Candidate pool

For knowledge bases of up to 500 entries, every entry is scored (68 today). Above that, the TF-IDF index (`tfidf.ts`) and the detected category pre-select candidates.

## Confidence

The top result gets a confidence value: 0.5 × relevance signal (relevance / 0.7, capped at 1) + 0.25 × category-detection confidence + 0.25 × relative lead over the runner-up. Labels: high ≥ 0.7, medium ≥ 0.4, otherwise low.

## Score breakdown

`scoreBreakdown` in responses contains `useCaseFit` (coverage), `keywordRelevance`, `categoryFit`, `relevance`, `qualityScore`, `developerExperience`, `pricingFit`, `recencyBonus`, `prior` and `total`. All values are rounded to 2 decimals.

## Measuring changes

Don't tune against individual queries by eye. Run:

```bash
npm run eval
```

It reports top-1 accuracy, top-3 accuracy and the must-not violation rate on `tests/eval/dev.json` (tuning set) and `tests/eval/holdout.json` (held out, never tuned on). Saved runs are in `tests/eval/results/`. See `tests/eval/README.md`.
