/**
 * MCP Tool: find_best_api
 * Finds and recommends the best API for a given task description.
 * Returns a structured recommendation with quick-start code.
 *
 * Exports: registerFindBestApi, buildFindBestApiResponse, MAX_CANDIDATES
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findApisDetailed, type SearchConstraints } from "../knowledge/search.js";
import type { ApiEntry } from "../knowledge/schema.js";
import { checkStaleness } from "../updater/staleness.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool:find-api");

const inputSchema = {
  task: z.string().min(1).describe(
    "Describe what you need the API to do, e.g. 'send transactional emails with templates'"
  ),
  constraints: z
    .object({
      maxPrice: z
        .string()
        .optional()
        .describe("Maximum acceptable price, e.g. '$50/month'"),
      requiredLanguage: z
        .string()
        .optional()
        .describe("Required SDK language, e.g. 'typescript', 'python'"),
      preferFree: z
        .boolean()
        .optional()
        .describe("Prefer APIs with free tiers"),
    })
    .optional()
    .describe("Optional constraints to filter recommendations"),
};

/** Max entries in the `candidates` field */
export const MAX_CANDIDATES = 5;

function pricingSummary(entry: ApiEntry): string {
  return (
    [
      entry.pricing.freeTier ? `Free: ${entry.pricing.freeTier}` : null,
      entry.pricing.startingPrice ? `Paid from ${entry.pricing.startingPrice}` : null,
      entry.pricing.model === "usage_based" ? "Usage-based (no monthly fee)" : null,
    ]
      .filter(Boolean)
      .join(" | ") || entry.pricing.model
  );
}

/**
 * lastVerified plus how stale that is. Dates are never changed automatically:
 * an entry is only "fresh" if a human re-verified it within 90 days.
 */
function freshness(entry: ApiEntry): {
  lastVerified: string;
  daysSinceVerified: number;
  level: "fresh" | "aging" | "stale" | "critical";
} {
  const s = checkStaleness(entry);
  return { lastVerified: s.lastVerified, daysSinceVerified: s.daysSinceVerified, level: s.level };
}

function freshnessNote(f: { lastVerified: string; daysSinceVerified: number }): string {
  return (
    `This entry was last verified on ${f.lastVerified} (${f.daysSinceVerified} days ago). ` +
    "Pricing, rate limits and SDK details may have changed since — confirm them on the provider's pricing and docs pages."
  );
}

/**
 * Build the find_best_api response body.
 *
 * Shape (backward compatible with v0.5.0, plus `candidates`):
 *   recommendation  — top result with quick-start code
 *   alternatives    — results 2..3
 *   candidates      — up to 5 relevant entries with key facts and their
 *                     relevance, so the calling model can make the final call
 *   totalEvaluated  — number of knowledge-base entries scored for this query
 * Every entry carries lastVerified; the recommendation also carries
 * freshness {lastVerified, daysSinceVerified, level} and a freshnessNote
 * when it is not fresh.
 */
export function buildFindBestApiResponse(
  task: string,
  constraints?: SearchConstraints
): Record<string, unknown> {
  const outcome = findApisDetailed(task, constraints, 3);
  const results = outcome.results;

  if (results.length === 0) {
    return {
      error: "No matching APIs found",
      suggestion:
        "Try a broader task description, or the API category may not be in the database yet.",
      totalEvaluated: outcome.evaluated,
      candidates: [],
    };
  }

  const [top, ...alternatives] = results;
  const entry = top!.entry;
  const bestExample = entry.codeExamples[0];
  const topFreshness = freshness(entry);

  return {
    recommendation: {
      name: entry.name,
      slug: entry.slug,
      why: `${entry.bestFor}. ${entry.qualityJustification}`,
      qualityScore: entry.qualityScore,
      confidence: top!.confidence ?? null,
      confidenceLabel: top!.confidenceLabel ?? null,
      scoreBreakdown: top!.scoreBreakdown,
      quickStart: {
        install: entry.sdk.installCommand,
        envVar: `${entry.auth.envVarName}=your_key_here`,
        authSnippet: entry.auth.codeSnippet,
        codeExample: bestExample?.code ?? "See documentation",
        codeExampleTitle: bestExample?.title ?? "",
        notes: bestExample?.notes ?? "",
      },
      gotchas: entry.gotchas,
      pricing: pricingSummary(entry),
      website: entry.website,
      rateLimitNote: `${entry.rateLimits.tier}: ${entry.rateLimits.limit}`,
      lastVerified: entry.lastVerified,
      freshness: topFreshness,
      ...(topFreshness.level === "fresh" ? {} : { freshnessNote: freshnessNote(topFreshness) }),
    },
    alternatives: alternatives.map((r) => ({
      name: r.entry.name,
      slug: r.entry.slug,
      why: r.entry.bestFor,
      qualityScore: r.entry.qualityScore,
      score: Math.round(r.score * 100) / 100,
      lastVerified: r.entry.lastVerified,
    })),
    candidates: outcome.relevant.slice(0, MAX_CANDIDATES).map((r) => ({
      slug: r.entry.slug,
      name: r.entry.name,
      category: r.entry.category,
      bestFor: r.entry.bestFor,
      relevance: Math.round((r.relevance ?? 0) * 100) / 100,
      score: Math.round(r.score * 100) / 100,
      qualityScore: r.entry.qualityScore,
      pricing: pricingSummary(r.entry),
      pricingModel: r.entry.pricing.model,
      primaryLanguage: r.entry.sdk.primaryLanguage,
      authMethod: r.entry.auth.method,
      topGotcha: r.entry.gotchas[0] ?? null,
      website: r.entry.website,
      lastVerified: r.entry.lastVerified,
      freshnessLevel: freshness(r.entry).level,
    })),
    totalEvaluated: outcome.evaluated,
  };
}

export function registerFindBestApi(server: McpServer): void {
  server.tool(
    "find_best_api",
    "Find and recommend the best API for a programming task. Returns a top recommendation with quick-start code, gotchas and alternatives, plus `candidates`: up to 5 relevant APIs with key facts and relevance scores so you can make the final choice for the user's context.",
    inputSchema,
    async ({ task, constraints }) => {
      logger.info("find_best_api called", { task, constraints });

      try {
        const response = buildFindBestApiResponse(task, constraints);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error("find_best_api error", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Internal error while searching for APIs",
                details: String(err),
              }),
            },
          ],
        };
      }
    }
  );
}
