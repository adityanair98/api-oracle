/**
 * MCP Tool: find_best_api
 * Finds and recommends the best API for a given task description.
 * Returns a structured recommendation with quick-start code.
 *
 * Exports: registerFindBestApi
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findApis } from "../knowledge/search.js";
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

export function registerFindBestApi(server: McpServer): void {
  server.tool(
    "find_best_api",
    "Find and recommend the best API for a programming task. Returns top recommendation with quick-start code, gotchas, and alternatives.",
    inputSchema,
    async ({ task, constraints }) => {
      logger.info("find_best_api called", { task, constraints });

      try {
        const results = findApis(task, constraints, 3);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "No matching APIs found",
                  suggestion:
                    "Try a broader task description, or the API category may not be in the database yet.",
                  totalEvaluated: 0,
                }),
              },
            ],
          };
        }

        const [top, ...alternatives] = results;
        const entry = top!.entry;

        // Build a one-line pricing summary
        const pricingSummary = [
          entry.pricing.freeTier ? `Free: ${entry.pricing.freeTier}` : null,
          entry.pricing.startingPrice
            ? `Paid from ${entry.pricing.startingPrice}`
            : null,
          entry.pricing.model === "usage_based" ? "Usage-based (no monthly fee)" : null,
        ]
          .filter(Boolean)
          .join(" | ") || entry.pricing.model;

        // Select best code example — prefer the first one
        const bestExample = entry.codeExamples[0];

        const response = {
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
            pricing: pricingSummary,
            website: entry.website,
            rateLimitNote: `${entry.rateLimits.tier}: ${entry.rateLimits.limit}`,
          },
          alternatives: alternatives.map((r) => ({
            name: r.entry.name,
            slug: r.entry.slug,
            why: r.entry.bestFor,
            qualityScore: r.entry.qualityScore,
            score: Math.round(r.score * 100) / 100,
          })),
          totalEvaluated: results.length + alternatives.length,
        };

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
