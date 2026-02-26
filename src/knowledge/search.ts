/**
 * Search layer — combines SQLite text search with the scoring engine.
 * Uses synonym expansion and category detection to improve result quality.
 *
 * Exports: SearchConstraints, RankedResult, findApis, getApiBySlug, getApisByCategory
 */

import type { ApiEntry } from "./schema.js";
import { getAllEntries, getBySlug, getByCategory } from "./db.js";
import { rankEntries, computeConfidence, confidenceLabel } from "./scorer.js";
import type { ScoringContext } from "./scorer.js";
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
  scoreBreakdown: Record<string, number>;
  /** Confidence in this recommendation (0-1); only set on the top result */
  confidence?: number;
  /** Human-readable confidence label: "high" | "medium" | "low" */
  confidenceLabel?: "high" | "medium" | "low";
}

/**
 * Find and rank APIs for a given task description.
 *
 * Pipeline:
 * 1. Detect phrases (preferFree, open source, etc.) — merge with constraints
 * 2. Expand query with synonyms
 * 3. SQLite text search on the expanded query (broader candidate pool)
 * 4. Also text-search on original query (catches exact matches)
 * 5. Detect category for scoring boost
 * 6. Rank all candidates with scorer using expanded query + context
 */
export function findApis(
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3
): RankedResult[] {
  logger.debug("findApis called", { query, constraints, topN });

  if (!query || query.trim().length === 0) {
    logger.warn("Empty query provided to findApis");
    return [];
  }

  const trimmedQuery = query.trim();

  // Step 1: Phrase detection — auto-apply preferFree from query language
  const phrases = detectPhrases(trimmedQuery);
  const effectiveConstraints: SearchConstraints = {
    ...constraints,
    preferFree: constraints?.preferFree ?? phrases.preferFree,
  };

  // Step 2: Synonym expansion
  const expandedQuery = expandQuery(trimmedQuery);
  logger.debug("Query expanded", {
    original: trimmedQuery,
    expanded: expandedQuery.length > trimmedQuery.length
      ? `${expandedQuery.slice(0, 80)}...`
      : "unchanged",
  });

  // Step 3: Category detection for scoring context
  const { category: detectedCategory, confidence: detectedConfidence } =
    detectCategory(trimmedQuery);
  logger.debug("Category detected", { detectedCategory, detectedConfidence });

  const scoringContext: ScoringContext = {
    expandedQuery,
    detectedCategory,
    detectedConfidence,
  };

  // Step 4: Build candidate pool via TF-IDF index
  // Lazily build the index from all entries on first call
  const all = getAllEntries();
  const engine = getTfIdfEngine();
  if (!engine.isBuilt) {
    engine.build(all);
    logger.debug("TF-IDF index built", { entryCount: engine.size });
  }

  // TF-IDF search on expanded query (broader recall than LIKE)
  const tfIdfCandidates = engine.search(expandedQuery, topN * 8);
  let candidates: ApiEntry[] = tfIdfCandidates;
  const seenSlugs = new Set(candidates.map((e) => e.slug));

  // Also include all entries in the detected category (high-signal candidates)
  if (detectedCategory && detectedConfidence >= 0.4) {
    const categoryEntries = getByCategory(detectedCategory);
    for (const entry of categoryEntries) {
      if (!seenSlugs.has(entry.slug)) {
        candidates.push(entry);
        seenSlugs.add(entry.slug);
      }
    }
  }

  // Safety net: if still fewer candidates than requested, add remaining entries
  if (candidates.length < topN) {
    logger.debug("Broadening to all entries — too few TF-IDF candidates", {
      candidateCount: candidates.length,
    });
    for (const entry of all) {
      if (!seenSlugs.has(entry.slug)) {
        candidates.push(entry);
        seenSlugs.add(entry.slug);
      }
    }
  }

  // Step 5: Rank with scorer using expanded query + context
  const results = rankEntries(
    candidates,
    trimmedQuery,
    effectiveConstraints,
    topN,
    undefined,
    scoringContext
  );

  // Step 6: Attach confidence to top result
  if (results.length > 0 && results[0]) {
    const conf = computeConfidence(results[0], detectedCategory, detectedConfidence, results);
    results[0].confidence = conf;
    results[0].confidenceLabel = confidenceLabel(conf);
  }

  logger.debug("findApis results", {
    candidateCount: candidates.length,
    resultCount: results.length,
    topSlug: results[0]?.entry.slug,
    confidence: results[0]?.confidence,
    detectedCategory,
  });

  return results;
}

/** Get a single API entry by its slug */
export function getApiBySlug(slug: string): ApiEntry | null {
  return getBySlug(slug);
}

/** Get all APIs in a category, ranked by quality score */
export function getApisByCategory(category: string): ApiEntry[] {
  return getByCategory(category);
}
