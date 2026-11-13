/**
 * Scoring/ranking engine — ranks API entries by relevance to a task description.
 *
 * Relevance gates the score. Query-independent factors (quality, developer
 * experience, pricing, recency) can only ADJUST an entry that is already
 * relevant — they can never make an unrelated API rank:
 *
 *   relevance = min(coverage + keyword bonus, 1) × categoryFit   ∈ [0, 1]
 *   prior     = weighted mean of quality, DX, pricing, recency    ∈ [0, 1]
 *   score     = relevance × (1 − PRIOR_INFLUENCE + PRIOR_INFLUENCE × prior)
 *               + keywordRelevance × KEYWORD_RANK_WEIGHT × categoryFit
 *
 * With PRIOR_INFLUENCE = 0.25 the prior scales a score between 0.75× and 1.0×
 * of its relevance, so a high-quality but irrelevant API (relevance≈0) scores
 * ≈0. The keyword term (the user named the API or its subcategory) sits
 * outside the clamp so a named API wins ties against entries that merely
 * mention it ("firebase" → Firebase, not "the open-source Firebase
 * alternative"). search.ts additionally drops candidates below a relevance
 * threshold and those in a clearly incompatible category.
 *
 * Exports: SCORING_WEIGHTS, DEFAULT_WEIGHTS, ScoreWeights, PRIOR_INFLUENCE, KEYWORD_RANK_WEIGHT,
 *          scoreEntry, rankEntries, tokenize, scoreDevExperience, categoryFit,
 *          computeConfidence, confidenceLabel, ScoringContext
 */

import type { ApiEntry } from "./schema.js";
import type { SearchConstraints, RankedResult } from "./search.js";
import { buildRelevanceModel, entryRelevance, type RelevanceModel } from "./relevance.js";

// ─── Configurable Weights ─────────────────────────────────────────────────────
// Must sum to 1.0. useCaseFit + keywordRelevance define RELEVANCE; the other
// four define the PRIOR (their relative weights within the prior).

export interface ScoreWeights {
  useCaseFit: number;          // IDF-weighted query coverage (use cases, bestFor, …)
  qualityScore: number;        // Curated quality score (1-10)
  developerExperience: number; // TypeScript SDK, code examples, setup clarity
  pricingFit: number;          // Free tier, pricing model alignment
  keywordRelevance: number;    // User named the API / its subcategory directly
  recencyBonus: number;        // lastVerified freshness
}

/** Default weights — must sum to exactly 1.0 */
export const SCORING_WEIGHTS: ScoreWeights = {
  useCaseFit: 0.35,
  qualityScore: 0.20,
  developerExperience: 0.15,
  pricingFit: 0.15,
  keywordRelevance: 0.10,
  recencyBonus: 0.05,
};

/** Alias for backwards compatibility */
export const DEFAULT_WEIGHTS: ScoreWeights = SCORING_WEIGHTS;

/** How much the query-independent prior can move a relevant entry's score */
export const PRIOR_INFLUENCE = 0.25;

/**
 * Ranking weight of keywordRelevance outside the relevance clamp
 * (= SCORING_WEIGHTS.keywordRelevance by default; see scoreEntry).
 */
export const KEYWORD_RANK_WEIGHT = SCORING_WEIGHTS.keywordRelevance;

// ─── Tokenizer (used by the TF-IDF index) ─────────────────────────────────────

// Stop words that add noise without semantic value in the scoring context
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all",
  "can", "her", "was", "one", "our", "out", "had", "has",
  "with", "this", "that", "from", "they", "have", "been",
  "more", "will", "when", "what", "your", "which", "how",
  "any", "use", "get", "let", "its", "also", "want", "need",
  "build", "add", "make", "app", "just",
]);

/**
 * Normalize text to a set of lowercase tokens.
 * Allows 2-char tokens (important for "ai", "db", "ml", "go").
 */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/** Overlap score between two token sets, normalised by the larger set */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap / Math.max(a.size, b.size);
}

// ─── Category fit ─────────────────────────────────────────────────────────────

/**
 * Categories that plausibly serve the same task. A query detected as "storage"
 * can be answered by infrastructure (S3/R2) or media (imgix) entries, but not
 * by payments.
 */
const CATEGORY_AFFINITY: Record<string, string[]> = {
  email: ["notifications"],
  payments: ["commerce"],
  commerce: ["payments", "cms"],
  ai: ["media"],
  media: ["ai", "storage", "infrastructure"],
  storage: ["infrastructure", "media", "database"],
  infrastructure: ["storage", "devops", "media"],
  devops: ["infrastructure", "database"],
  database: ["storage", "auth", "infrastructure", "devops"],
  auth: ["database", "security"],
  search: ["database"],
  messaging: ["communication", "notifications"],
  communication: ["messaging", "notifications"],
  notifications: ["messaging", "communication", "email"],
  analytics: ["testing"],
  testing: ["analytics"],
  security: ["auth", "database", "infrastructure"],
  workflow: ["devops", "integration", "infrastructure"],
  integration: ["workflow", "forms"],
  forms: ["integration"],
  cms: ["commerce"],
  scheduling: [],
  maps: [],
};

/** Minimum detection confidence before category is used at all */
const CATEGORY_MIN_CONFIDENCE = 0.4;

/**
 * Relevance multiplier from category alignment with the detected task category:
 * same 1.0, related 0.9, unrelated 0.7. No detection → 1.0 (neutral).
 */
export function categoryFit(
  entryCategory: string,
  detectedCategory: string | null,
  detectedConfidence: number
): number {
  if (!detectedCategory || detectedConfidence < CATEGORY_MIN_CONFIDENCE) return 1.0;
  if (entryCategory === detectedCategory) return 1.0;
  if (CATEGORY_AFFINITY[detectedCategory]?.includes(entryCategory)) return 0.9;
  return 0.7;
}

// ─── Developer Experience (sub-scored) ────────────────────────────────────────

/**
 * DX sub-scoring with measurable, explicit factors:
 * - TypeScript as primary SDK: 3 pts
 * - 2+ code examples: 2 pts
 * - envVarName defined (clear auth setup): 1 pt
 * - Single npm install command: 1 pt
 * - Multiple language SDKs (3+): 1 pt
 * - Required language match: up to 2 pts (only when requiredLanguage is specified)
 *
 * Normalized to 0-1 range. Base max = 8 pts; with language constraint = 10 pts.
 */
export function scoreDevExperience(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  let score = 0;
  let maxScore = 8;

  if (entry.sdk.primaryLanguage.toLowerCase() === "typescript") {
    score += 3;
  } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === "typescript")) {
    score += 1.5;
  }

  if (entry.codeExamples.length >= 2) {
    score += 2;
  } else if (entry.codeExamples.length === 1) {
    score += 1;
  }

  if (entry.auth.envVarName && entry.auth.envVarName.length > 0) {
    score += 1;
  }

  if (entry.sdk.installCommand.includes("npm install")) {
    score += 1;
  }

  if (entry.sdk.otherLanguages.length >= 3) {
    score += 1;
  }

  if (constraints?.requiredLanguage) {
    maxScore += 2;
    const required = constraints.requiredLanguage.toLowerCase();
    if (entry.sdk.primaryLanguage.toLowerCase() === required) {
      score += 2;
    } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === required)) {
      score += 1;
    }
  }

  return score / maxScore;
}

// ─── Quality / Pricing / Recency (prior components) ───────────────────────────

function scoreQuality(entry: ApiEntry): number {
  return (entry.qualityScore - 1) / 9;
}

function scorePricingFit(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  if (constraints?.preferFree) {
    if (entry.pricing.model === "free" || entry.pricing.model === "open_source") {
      return 1.0;
    }
    if (entry.pricing.model === "freemium" && entry.pricing.freeTier !== null) {
      return 0.85;
    }
    if (entry.pricing.model === "usage_based") {
      return 0.60; // Can be free at low usage
    }
    return 0.20; // Paid-only is a poor match
  }

  // No pricing constraint — slight boost for easy-to-start options
  if (entry.pricing.model === "free" || entry.pricing.model === "open_source") {
    return 0.70;
  }
  if (entry.pricing.model === "freemium") {
    return 0.65;
  }
  if (entry.pricing.model === "usage_based") {
    return 0.60;
  }
  return 0.50; // Paid — neutral
}

const MS_PER_DAY = 86_400_000;

/**
 * Recency: verified within 30 days → 1.0, linearly to 0 at 365 days.
 * Computed at call time (not module load) so long-running servers stay correct.
 */
function scoreRecency(entry: ApiEntry, nowMs: number = Date.now()): number {
  const verifiedMs = new Date(entry.lastVerified).getTime();
  if (Number.isNaN(verifiedMs)) return 0;
  const daysOld = (nowMs - verifiedMs) / MS_PER_DAY;
  if (daysOld <= 30) return 1.0;
  if (daysOld <= 365) return 1.0 - (daysOld - 30) / 335;
  return 0;
}

// ─── Keyword Relevance ────────────────────────────────────────────────────────

/**
 * Direct keyword relevance on the ORIGINAL query (not the synonym-expanded
 * one): rewards the user naming the API ("algolia", "stripe") or its subcategory.
 */
function scoreKeywordRelevance(entry: ApiEntry, queryTokens: Set<string>): number {
  const nameMatch = tokenOverlap(queryTokens, tokenize(entry.name));
  const slugMatch = tokenOverlap(queryTokens, tokenize(entry.slug.replace(/-/g, " ")));
  const subCatMatch = tokenOverlap(queryTokens, tokenize(entry.subcategory.replace(/-/g, " ")));
  return Math.min(nameMatch * 0.5 + slugMatch * 0.3 + subCatMatch * 0.2, 1.0);
}

// ─── Confidence Score ─────────────────────────────────────────────────────────

/**
 * Confidence (0-1) for the top result: how relevant it is, how clear the
 * category is, and how far it is ahead of the runner-up.
 */
export function computeConfidence(
  topResult: RankedResult,
  detectedCategory: string | null,
  detectedConfidence: number,
  allResults: RankedResult[]
): number {
  const relevance = topResult.scoreBreakdown["relevance"] ?? 0;
  const totalScore = topResult.score;

  const fitSignal = Math.min(relevance / 0.7, 1.0);
  const catSignal = detectedCategory ? detectedConfidence : 0;
  const separation =
    allResults.length >= 2
      ? Math.min(((totalScore - allResults[1]!.score) / Math.max(totalScore, 0.01)) * 4, 1.0)
      : 0.5;

  const raw = fitSignal * 0.5 + catSignal * 0.25 + separation * 0.25;
  return Math.round(Math.min(raw, 1.0) * 100) / 100;
}

/** Human-readable confidence label */
export function confidenceLabel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

// ─── Scoring Context (passed from search.ts) ──────────────────────────────────

export interface ScoringContext {
  /** Kept for compatibility; relevance uses the original query + synonym groups */
  expandedQuery?: string;
  detectedCategory: string | null;
  detectedConfidence: number;
  /** Prebuilt relevance model over the full candidate set (IDF needs the corpus) */
  relevanceModel?: RelevanceModel;
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreEntry(
  entry: ApiEntry,
  query: string,
  constraints?: SearchConstraints,
  weights: ScoreWeights = SCORING_WEIGHTS,
  context?: ScoringContext
): RankedResult {
  const model = context?.relevanceModel ?? buildRelevanceModel(query, [entry]);

  // Relevance (query-dependent)
  const coverage = entryRelevance(model, entry.slug);
  const keyword = scoreKeywordRelevance(entry, tokenize(query));
  const keywordBonus = weights.useCaseFit > 0 ? weights.keywordRelevance / weights.useCaseFit : 0;
  const catFit = categoryFit(
    entry.category,
    context?.detectedCategory ?? null,
    context?.detectedConfidence ?? 0
  );
  const relevance = Math.min(coverage + keyword * keywordBonus, 1.0) * catFit;

  // Prior (query-independent) — can only adjust a relevant entry
  const quality = scoreQuality(entry);
  const dx = scoreDevExperience(entry, constraints);
  const pricing = scorePricingFit(entry, constraints);
  const recency = scoreRecency(entry);
  const priorWeight =
    weights.qualityScore + weights.developerExperience + weights.pricingFit + weights.recencyBonus;
  const prior =
    priorWeight > 0
      ? (quality * weights.qualityScore +
          dx * weights.developerExperience +
          pricing * weights.pricingFit +
          recency * weights.recencyBonus) /
        priorWeight
      : 0;

  const totalScore =
    relevance * (1 - PRIOR_INFLUENCE + PRIOR_INFLUENCE * prior) +
    keyword * weights.keywordRelevance * catFit;

  const scoreBreakdown: Record<string, number> = {
    useCaseFit: round2(coverage),
    keywordRelevance: round2(keyword),
    categoryFit: round2(catFit),
    relevance: round2(relevance),
    qualityScore: round2(quality),
    developerExperience: round2(dx),
    pricingFit: round2(pricing),
    recencyBonus: round2(recency),
    prior: round2(prior),
    total: round2(totalScore),
  };

  return { entry, score: totalScore, relevance, scoreBreakdown };
}

// ─── Ranking Function ─────────────────────────────────────────────────────────

/**
 * Score and sort entries (no filtering — see findApis for relevance gating).
 * The relevance model is built over `entries`, so IDF reflects the corpus.
 */
export function rankEntries(
  entries: ApiEntry[],
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3,
  weights: ScoreWeights = SCORING_WEIGHTS,
  context?: ScoringContext
): RankedResult[] {
  if (entries.length === 0) return [];

  const fullContext: ScoringContext = {
    detectedCategory: context?.detectedCategory ?? null,
    detectedConfidence: context?.detectedConfidence ?? 0,
    expandedQuery: context?.expandedQuery,
    relevanceModel: context?.relevanceModel ?? buildRelevanceModel(query, entries),
  };

  const scored = entries.map((entry) =>
    scoreEntry(entry, query, constraints, weights, fullContext)
  );

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
