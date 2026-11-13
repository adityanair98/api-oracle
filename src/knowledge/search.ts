/**
 * Search layer — scores the knowledge base against a task and keeps only
 * candidates that are actually relevant to it.
 *
 * Exports: SearchConstraints, RankedResult, SearchOutcome, RELEVANCE_GATE,
 *          findApis, findApisDetailed, getApiBySlug, getApisByCategory
 */

import type { ApiEntry } from "./schema.js";
import { getAllEntries, getBySlug, getByCategory } from "./db.js";
import { rankEntries, computeConfidence, confidenceLabel } from "./scorer.js";
import type { ScoringContext } from "./scorer.js";
import { buildRelevanceModel } from "./relevance.js";
import { expandQuery, detectCategory, detectPhrases } from "./synonyms.js";
import { getTfIdfEngine } from "./tfidf.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("search");

export interface SearchConstraints {
  maxPrice?: string;
  requiredLanguage?: string;
  preferFree?: boolean;
}

export interface RankedResult {
  entry: ApiEntry;
  score: number;
  /** Query relevance in [0,1] before the quality/DX/pricing/recency prior */
  relevance?: number;
  scoreBreakdown: Record<string, number>;
  /** Confidence in this recommendation (0-1); only set on the top result */
  confidence?: number;
  /** Human-readable confidence label: "high" | "medium" | "low" */
  confidenceLabel?: "high" | "medium" | "low";
}

export interface SearchOutcome {
  /** Top `topN` relevant results, best first */
  results: RankedResult[];
  /** All candidates that passed the relevance gate, best first */
  relevant: RankedResult[];
  /** How many entries were scored */
  evaluated: number;
  detectedCategory: string | null;
}

/**
 * Relevance gate. A candidate is kept only if:
 *  - relevance ≥ minAbsolute, and
 *  - relevance ≥ minRelativeToBest × the best candidate's relevance, and
 *  - it is not in a clearly unrelated category (categoryFit at its floor while
 *    the category was detected with ≥ strongCategoryConfidence) unless its own
 *    relevance is ≥ categoryOverride.
 */
export const RELEVANCE_GATE = {
  minAbsolute: 0.2,
  minRelativeToBest: 0.6,
  strongCategoryConfidence: 0.5,
  categoryOverride: 0.6,
} as const;

/** Above this many entries, use the TF-IDF index to pre-select candidates */
const SCORE_ALL_ENTRIES_UP_TO = 500;

/**
 * Find and rank APIs for a task, with stats. Pipeline:
 * 1. Phrase detection (e.g. "free" → preferFree) merged with constraints
 * 2. Category detection
 * 3. Candidate pool: every entry (small KB) or TF-IDF + detected category
 * 4. Score: relevance × bounded quality/DX/pricing/recency prior
 * 5. Gate: drop candidates that are not relevant enough (RELEVANCE_GATE)
 */
export function findApisDetailed(
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3
): SearchOutcome {
  const empty: SearchOutcome = { results: [], relevant: [], evaluated: 0, detectedCategory: null };
  if (!query || query.trim().length === 0) {
    logger.warn("Empty query provided to findApis");
    return empty;
  }

  const trimmedQuery = query.trim();

  const phrases = detectPhrases(trimmedQuery);
  const effectiveConstraints: SearchConstraints = {
    ...constraints,
    preferFree: constraints?.preferFree ?? phrases.preferFree,
  };

  const { category: detectedCategory, confidence: detectedConfidence } =
    detectCategory(trimmedQuery);

  const all = getAllEntries();
  let pool: ApiEntry[] = all;
  if (all.length > SCORE_ALL_ENTRIES_UP_TO) {
    const engine = getTfIdfEngine();
    if (!engine.isBuilt) engine.build(all);
    pool = engine.search(expandQuery(trimmedQuery), 100);
    const seen = new Set(pool.map((e) => e.slug));
    if (detectedCategory) {
      for (const e of getByCategory(detectedCategory)) {
        if (!seen.has(e.slug)) pool.push(e);
      }
    }
  }
  if (pool.length === 0) return { ...empty, detectedCategory };

  const context: ScoringContext = {
    detectedCategory,
    detectedConfidence,
    relevanceModel: buildRelevanceModel(trimmedQuery, pool),
  };
  const scored = rankEntries(pool, trimmedQuery, effectiveConstraints, pool.length, undefined, context);

  const bestRelevance = Math.max(0, ...scored.map((r) => r.relevance ?? 0));
  const strongCategory =
    detectedCategory !== null && detectedConfidence >= RELEVANCE_GATE.strongCategoryConfidence;

  const relevant = scored.filter((r) => {
    const rel = r.relevance ?? 0;
    if (rel < RELEVANCE_GATE.minAbsolute) return false;
    if (rel < RELEVANCE_GATE.minRelativeToBest * bestRelevance) return false;
    const unrelatedCategory = (r.scoreBreakdown["categoryFit"] ?? 1) <= 0.7;
    if (strongCategory && unrelatedCategory && rel < RELEVANCE_GATE.categoryOverride) return false;
    return true;
  });

  const results = relevant.slice(0, topN);
  if (results[0]) {
    const conf = computeConfidence(results[0], detectedCategory, detectedConfidence, relevant);
    results[0].confidence = conf;
    results[0].confidenceLabel = confidenceLabel(conf);
  }

  logger.debug("findApis results", {
    query: trimmedQuery,
    evaluated: pool.length,
    relevant: relevant.length,
    top: results.map((r) => `${r.entry.slug}:${r.score.toFixed(2)}`),
    detectedCategory,
  });

  return { results, relevant, evaluated: pool.length, detectedCategory };
}

/** Find and rank APIs for a task — relevant results only, best first. */
export function findApis(
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3
): RankedResult[] {
  return findApisDetailed(query, constraints, topN).results;
}

/** Get a single API entry by its slug */
export function getApiBySlug(slug: string): ApiEntry | null {
  return getBySlug(slug);
}

/** Get all APIs in a category, ranked by quality score */
export function getApisByCategory(category: string): ApiEntry[] {
  return getByCategory(category);
}
