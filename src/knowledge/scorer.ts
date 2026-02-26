/**
 * Scoring/ranking engine — ranks API entries by relevance to a task description.
 * Uses weighted multi-factor scoring across 6 dimensions.
 *
 * Exports: SCORING_WEIGHTS, DEFAULT_WEIGHTS, ScoreWeights, scoreEntry, rankEntries,
 *          tokenize, scoreUseCaseFit, scoreDevExperience
 */

import type { ApiEntry } from "./schema.js";
import type { SearchConstraints, RankedResult } from "./search.js";

// ─── Configurable Weights ─────────────────────────────────────────────────────
// Tune these to adjust ranking priorities. Must sum to 1.0.

export interface ScoreWeights {
  useCaseFit: number;         // Match against use cases, bestFor, description
  qualityScore: number;       // Curated quality score (1-10)
  developerExperience: number;// TypeScript SDK, code examples, setup clarity
  pricingFit: number;         // Free tier, pricing model alignment
  keywordRelevance: number;   // Direct keyword match against name/slug/subcategory
  recencyBonus: number;       // lastVerified freshness bonus
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

// ─── Tokenizer ────────────────────────────────────────────────────────────────

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

/** Compute Jaccard-like overlap score between two token sets */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap / Math.max(a.size, b.size);
}

// ─── Category Signals ─────────────────────────────────────────────────────────

const CATEGORY_SIGNALS: Record<string, string[]> = {
  email: ["email", "mail", "smtp", "send", "transactional", "newsletter", "inbox", "bounce", "mailer"],
  payments: ["payment", "pay", "checkout", "charge", "billing", "invoice", "subscription", "card", "upi", "merchant", "transaction"],
  ai: ["ai", "ml", "llm", "gpt", "claude", "openai", "anthropic", "model", "completion", "embedding", "chatbot", "generate", "inference", "generative"],
  storage: ["upload", "file", "image", "video", "media", "storage", "cdn", "asset", "photo", "bucket", "picture", "avatar"],
  search: ["search", "query", "index", "algolia", "fulltext", "autocomplete", "facet", "filter", "typeahead"],
  auth: ["auth", "authentication", "login", "signin", "signup", "oauth", "sso", "identity", "session", "token", "jwt", "credential"],
  messaging: ["sms", "text", "message", "messaging", "phone", "call", "voice", "telephony", "twilio", "vonage"],
  analytics: ["analytics", "tracking", "metrics", "event", "crash", "exception", "error", "monitoring", "observability", "posthog", "sentry"],
  database: ["database", "db", "sql", "nosql", "postgres", "mysql", "query", "datastore", "backend", "persist"],
  media: ["audio", "video", "stream", "transcribe", "transcode", "speech", "mux", "deepgram"],
  notifications: ["notification", "push", "alert", "bell", "notify", "apns", "fcm"],
  maps: ["map", "maps", "geo", "location", "address", "geocode", "navigation", "direction", "coordinate"],
  communication: ["chat", "conversation", "channel", "room", "thread", "realtime", "websocket", "pusher", "ably"],
};

function scoreCategoryMatch(queryTokens: Set<string>, category: string): number {
  const signals = CATEGORY_SIGNALS[category] ?? [];
  if (signals.length === 0) return 0;
  const signalSet = new Set(signals);
  let matched = 0;
  for (const token of queryTokens) {
    if (signalSet.has(token)) matched++;
  }
  return Math.min(matched / 3, 1.0);
}

// ─── 1. Use Case Fit (multi-field) ────────────────────────────────────────────

const FIT_WEIGHTS = {
  perfect: 1.0,
  good: 0.7,
  partial: 0.4,
} as const;

/**
 * Score against multiple fields with weighted relevance:
 * - Use case tasks (40%) — with fit multiplier, best match wins
 * - bestFor (25%) — concise purpose statement
 * - Description (20%) — first 200 chars (signal-dense)
 * - Category signals (15%) — broad category alignment
 */
export function scoreUseCaseFit(entry: ApiEntry, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;

  // Use case task matching
  let bestUseCaseScore = 0;
  for (const useCase of entry.useCases) {
    const useCaseTokens = tokenize(useCase.task);
    const overlap = tokenOverlap(queryTokens, useCaseTokens);
    const score = overlap * FIT_WEIGHTS[useCase.fit];
    if (score > bestUseCaseScore) bestUseCaseScore = score;
  }

  // bestFor
  const bestForScore = tokenOverlap(queryTokens, tokenize(entry.bestFor));

  // Description (first 200 chars)
  const descScore = tokenOverlap(queryTokens, tokenize(entry.description.slice(0, 200)));

  // Category match
  const categoryScore = scoreCategoryMatch(queryTokens, entry.category);

  return Math.min(
    bestUseCaseScore * 0.40 +
    bestForScore * 0.25 +
    descScore * 0.20 +
    categoryScore * 0.15,
    1.0
  );
}

// ─── 2. Quality Score ─────────────────────────────────────────────────────────

function scoreQuality(entry: ApiEntry): number {
  return (entry.qualityScore - 1) / 9;
}

// ─── 3. Developer Experience (sub-scored) ─────────────────────────────────────

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

  // TypeScript primary SDK (+3)
  if (entry.sdk.primaryLanguage.toLowerCase() === "typescript") {
    score += 3;
  } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === "typescript")) {
    score += 1.5;
  }

  // 2+ code examples (+2)
  if (entry.codeExamples.length >= 2) {
    score += 2;
  } else if (entry.codeExamples.length === 1) {
    score += 1;
  }

  // envVarName defined — clear auth setup (+1)
  if (entry.auth.envVarName && entry.auth.envVarName.length > 0) {
    score += 1;
  }

  // Single npm install command (+1)
  if (entry.sdk.installCommand.includes("npm install")) {
    score += 1;
  }

  // Multiple language SDKs (3+) (+1)
  if (entry.sdk.otherLanguages.length >= 3) {
    score += 1;
  }

  // Required language match (only when constraint specified; +2)
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

// ─── 4. Pricing Fit ───────────────────────────────────────────────────────────

function scorePricingFit(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  if (constraints?.preferFree) {
    // preferFree: generous free tier or open source scores highest
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

// ─── 5. Keyword Relevance ─────────────────────────────────────────────────────

/**
 * Direct keyword relevance: checks if query tokens appear in name/slug/subcategory.
 * This rewards exact API name matches ("algolia" for search queries, "stripe" for payments).
 */
function scoreKeywordRelevance(entry: ApiEntry, queryTokens: Set<string>): number {
  const nameTokens = tokenize(entry.name);
  const slugTokens = tokenize(entry.slug.replace(/-/g, " "));
  const subCatTokens = tokenize(entry.subcategory.replace(/-/g, " "));

  // Boost when API name or slug appears in query (user named the tool directly)
  const nameMatch = tokenOverlap(queryTokens, nameTokens);
  const slugMatch = tokenOverlap(queryTokens, slugTokens);
  const subCatMatch = tokenOverlap(queryTokens, subCatTokens);

  // Name match is strongest signal (user asked for "stripe" or "algolia" by name)
  return Math.min(nameMatch * 0.5 + slugMatch * 0.3 + subCatMatch * 0.2, 1.0);
}

// ─── 6. Recency Bonus ─────────────────────────────────────────────────────────

const NOW_MS = Date.now();
const MS_PER_DAY = 86_400_000;

/**
 * Recency bonus: entries verified within 30 days score 1.0.
 * Scales linearly to 0 at 365 days. Older entries score 0.
 */
function scoreRecency(entry: ApiEntry): number {
  try {
    const verifiedMs = new Date(entry.lastVerified).getTime();
    const daysOld = (NOW_MS - verifiedMs) / MS_PER_DAY;
    if (daysOld <= 30) return 1.0;
    if (daysOld <= 365) return 1.0 - (daysOld - 30) / 335;
    return 0;
  } catch {
    return 0;
  }
}

// ─── Category Boost ───────────────────────────────────────────────────────────

function applyCategoryBoost(
  score: number,
  entry: ApiEntry,
  detectedCategory: string | null,
  detectedConfidence: number
): number {
  if (!detectedCategory || detectedConfidence < 0.4) return score;
  if (entry.category === detectedCategory) {
    const boost = detectedConfidence * 0.12; // Up to 12% boost
    return Math.min(score * (1 + boost), 1.0);
  }
  return score;
}

// ─── Confidence Score ─────────────────────────────────────────────────────────

/**
 * Compute a confidence value (0-1) for how certain we are about the top result.
 *
 * High confidence (>0.8): strong category match + high useCaseFit score
 * Medium confidence (0.5-0.8): partial signals
 * Low confidence (<0.5): weak query, no clear category
 */
export function computeConfidence(
  topResult: RankedResult,
  detectedCategory: string | null,
  detectedConfidence: number,
  allResults: RankedResult[]
): number {
  const useCaseFit = topResult.scoreBreakdown["useCaseFit"] ?? 0;
  const totalScore = topResult.score;

  // Factor 1: useCaseFit raw score quality
  const fitSignal = Math.min(useCaseFit / 0.5, 1.0); // 0.5+ useCaseFit → full signal

  // Factor 2: category detection confidence
  const catSignal = detectedCategory ? detectedConfidence : 0;

  // Factor 3: score separation (top result vs runner-up)
  const separation =
    allResults.length >= 2
      ? Math.min((totalScore - allResults[1]!.score) * 5, 1.0)
      : 0.5;

  // Weighted combination
  const raw = fitSignal * 0.40 + catSignal * 0.35 + separation * 0.25;
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
  expandedQuery: string;
  detectedCategory: string | null;
  detectedConfidence: number;
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

export function scoreEntry(
  entry: ApiEntry,
  query: string,
  constraints?: SearchConstraints,
  weights: ScoreWeights = SCORING_WEIGHTS,
  context?: ScoringContext
): RankedResult {
  const effectiveQuery = context?.expandedQuery ?? query;
  const queryTokens = tokenize(effectiveQuery);

  const useCaseFitRaw = scoreUseCaseFit(entry, queryTokens);
  const qualityRaw = scoreQuality(entry);
  const devExperienceRaw = scoreDevExperience(entry, constraints);
  const pricingFitRaw = scorePricingFit(entry, constraints);
  const keywordRelevanceRaw = scoreKeywordRelevance(entry, queryTokens);
  const recencyRaw = scoreRecency(entry);

  const baseScore =
    useCaseFitRaw * weights.useCaseFit +
    qualityRaw * weights.qualityScore +
    devExperienceRaw * weights.developerExperience +
    pricingFitRaw * weights.pricingFit +
    keywordRelevanceRaw * weights.keywordRelevance +
    recencyRaw * weights.recencyBonus;

  const totalScore = applyCategoryBoost(
    baseScore,
    entry,
    context?.detectedCategory ?? null,
    context?.detectedConfidence ?? 0
  );

  const scoreBreakdown: Record<string, number> = {
    useCaseFit: Math.round(useCaseFitRaw * 100) / 100,
    qualityScore: Math.round(qualityRaw * 100) / 100,
    developerExperience: Math.round(devExperienceRaw * 100) / 100,
    pricingFit: Math.round(pricingFitRaw * 100) / 100,
    keywordRelevance: Math.round(keywordRelevanceRaw * 100) / 100,
    recencyBonus: Math.round(recencyRaw * 100) / 100,
    total: Math.round(totalScore * 100) / 100,
  };

  return { entry, score: totalScore, scoreBreakdown };
}

// ─── Ranking Function ─────────────────────────────────────────────────────────

export function rankEntries(
  entries: ApiEntry[],
  query: string,
  constraints?: SearchConstraints,
  topN: number = 3,
  weights: ScoreWeights = SCORING_WEIGHTS,
  context?: ScoringContext
): RankedResult[] {
  if (entries.length === 0) return [];

  const scored = entries.map((entry) =>
    scoreEntry(entry, query, constraints, weights, context)
  );

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
