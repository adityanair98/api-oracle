/**
 * Scoring/ranking engine — ranks API entries by relevance to a task description.
 * Uses weighted multi-factor scoring across use case fit, quality, dev experience, and pricing.
 *
 * Exports: ScoreWeights, DEFAULT_WEIGHTS, scoreEntry, rankEntries
 */

import type { ApiEntry } from "./schema.js";
import type { SearchConstraints, RankedResult } from "./search.js";

// ─── Weights ──────────────────────────────────────────────────────────────────

export interface ScoreWeights {
  useCaseFit: number;    // 0.40 — how well the API matches the task
  qualityScore: number;  // 0.25 — curated quality score from the entry
  devExperience: number; // 0.20 — TypeScript SDK, code examples, setup clarity
  pricingFit: number;    // 0.15 — free tier, pricing model alignment
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  useCaseFit: 0.40,
  qualityScore: 0.25,
  devExperience: 0.20,
  pricingFit: 0.15,
};

// ─── Keyword extraction ────────────────────────────────────────────────────────

/** Normalize text to a set of lowercase tokens for comparison */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
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

// ─── Category keywords ─────────────────────────────────────────────────────────

/** Strong category signals — these get a boost when matched */
const CATEGORY_SIGNALS: Record<string, string[]> = {
  email: ["email", "mail", "smtp", "send", "transactional", "newsletter", "inbox", "bounce", "message"],
  payments: ["payment", "pay", "checkout", "charge", "billing", "invoice", "subscription", "card", "stripe", "upi", "merchant"],
  ai: ["ai", "llm", "gpt", "claude", "openai", "anthropic", "model", "completion", "embedding", "chatbot", "generate", "inference"],
  storage: ["upload", "file", "image", "video", "media", "storage", "cdn", "asset", "photo", "bucket"],
  search: ["search", "query", "index", "algolia", "full-text", "autocomplete", "facet", "filter"],
  auth: ["auth", "login", "signup", "oauth", "sso", "saml", "identity", "user", "session", "token", "jwt"],
  messaging: ["sms", "notification", "push", "webhook", "chat", "message"],
  analytics: ["analytics", "tracking", "metrics", "dashboard", "events"],
  database: ["database", "db", "sql", "nosql", "query", "orm"],
  media: ["audio", "video", "stream", "transcribe", "transcode"],
  notifications: ["notification", "push", "alert", "bell"],
  maps: ["maps", "geo", "location", "address", "coordinates", "directions"],
  communication: ["voice", "call", "phone", "sms", "twilio"],
};

/** Score how well the query matches a category */
function scoreCategoryMatch(query: Set<string>, category: string): number {
  const signals = CATEGORY_SIGNALS[category] ?? [];
  if (signals.length === 0) return 0;
  const signalSet = new Set(signals);
  let matched = 0;
  for (const token of query) {
    if (signalSet.has(token)) matched++;
  }
  // Normalize: max out at 3+ matches = 1.0
  return Math.min(matched / 3, 1.0);
}

// ─── Use Case Fit Scoring ──────────────────────────────────────────────────────

const FIT_WEIGHTS = {
  perfect: 1.0,
  good: 0.7,
  partial: 0.4,
} as const;

function scoreUseCaseFit(entry: ApiEntry, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;

  let bestScore = 0;

  for (const useCase of entry.useCases) {
    const useCaseTokens = tokenize(useCase.task);
    const overlap = tokenOverlap(queryTokens, useCaseTokens);
    const fitMultiplier = FIT_WEIGHTS[useCase.fit];
    const useCaseScore = overlap * fitMultiplier;
    if (useCaseScore > bestScore) {
      bestScore = useCaseScore;
    }
  }

  // Also factor in category match
  const categoryScore = scoreCategoryMatch(queryTokens, entry.category);

  // Weight: 60% use case text match, 40% category match
  const combined = bestScore * 0.6 + categoryScore * 0.4;

  // Clamp to [0, 1]
  return Math.min(combined, 1.0);
}

// ─── Quality Score ─────────────────────────────────────────────────────────────

function scoreQuality(entry: ApiEntry): number {
  // qualityScore is 1-10, normalize to 0-1
  return (entry.qualityScore - 1) / 9;
}

// ─── Developer Experience ──────────────────────────────────────────────────────

function scoreDevExperience(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  let score = 0;
  let maxScore = 0;

  // TypeScript as primary language (+30 points)
  maxScore += 30;
  if (entry.sdk.primaryLanguage.toLowerCase() === "typescript") {
    score += 30;
  } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === "typescript")) {
    score += 15;
  }

  // Required language match (+20 points)
  maxScore += 20;
  if (constraints?.requiredLanguage) {
    const required = constraints.requiredLanguage.toLowerCase();
    if (entry.sdk.primaryLanguage.toLowerCase() === required) {
      score += 20;
    } else if (entry.sdk.otherLanguages.some((l) => l.toLowerCase() === required)) {
      score += 10;
    }
  } else {
    score += 20; // No constraint — full points
  }

  // Number of code examples (+20 points)
  maxScore += 20;
  const exampleScore = Math.min(entry.codeExamples.length / 3, 1) * 20;
  score += exampleScore;

  // Auth setup clarity — few steps is better (+15 points)
  maxScore += 15;
  const setupSteps = entry.auth.setupSteps.length;
  if (setupSteps <= 3) score += 15;
  else if (setupSteps <= 5) score += 10;
  else score += 5;

  // Gotcha-to-example ratio — too many gotchas signal rough DX (+15 points)
  maxScore += 15;
  const gotchaRatio = entry.gotchas.length / Math.max(entry.codeExamples.length, 1);
  if (gotchaRatio <= 1.5) score += 15;
  else if (gotchaRatio <= 3) score += 8;
  else score += 3;

  return score / maxScore;
}

// ─── Pricing Fit ──────────────────────────────────────────────────────────────

function scorePricingFit(
  entry: ApiEntry,
  constraints?: SearchConstraints
): number {
  let score = 0.5; // Neutral baseline

  if (constraints?.preferFree) {
    if (entry.pricing.model === "free" || entry.pricing.model === "open_source") {
      score = 1.0;
    } else if (
      entry.pricing.model === "freemium" &&
      entry.pricing.freeTier !== null
    ) {
      score = 0.85;
    } else if (entry.pricing.model === "usage_based") {
      score = 0.6; // Usage-based can be effectively free at low usage
    } else {
      score = 0.2; // Paid only
    }
  } else {
    // No pricing preference — slight boost for usage-based (no upfront cost)
    if (entry.pricing.model === "usage_based") {
      score = 0.65;
    } else if (entry.pricing.model === "freemium") {
      score = 0.6;
    } else if (entry.pricing.model === "free" || entry.pricing.model === "open_source") {
      score = 0.7;
    } else {
      score = 0.5;
    }
  }

  return score;
}

// ─── Main Scoring Function ────────────────────────────────────────────────────

export function scoreEntry(
  entry: ApiEntry,
  query: string,
  constraints?: SearchConstraints,
  weights: ScoreWeights = DEFAULT_WEIGHTS
): RankedResult {
  const queryTokens = tokenize(query);

  const useCaseFitRaw = scoreUseCaseFit(entry, queryTokens);
  const qualityRaw = scoreQuality(entry);
  const devExperienceRaw = scoreDevExperience(entry, constraints);
  const pricingFitRaw = scorePricingFit(entry, constraints);

  const totalScore =
    useCaseFitRaw * weights.useCaseFit +
    qualityRaw * weights.qualityScore +
    devExperienceRaw * weights.devExperience +
    pricingFitRaw * weights.pricingFit;

  const scoreBreakdown: Record<string, number> = {
    useCaseFit: Math.round(useCaseFitRaw * 100) / 100,
    qualityScore: Math.round(qualityRaw * 100) / 100,
    devExperience: Math.round(devExperienceRaw * 100) / 100,
    pricingFit: Math.round(pricingFitRaw * 100) / 100,
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
  weights: ScoreWeights = DEFAULT_WEIGHTS
): RankedResult[] {
  if (entries.length === 0) return [];

  const scored = entries.map((entry) =>
    scoreEntry(entry, query, constraints, weights)
  );

  // Sort descending by total score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}
