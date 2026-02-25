/**
 * MCP Tool: compare_apis
 * Side-by-side comparison of multiple APIs by their slugs.
 *
 * Exports: registerCompareApis
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiBySlug } from "../knowledge/search.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool:compare-apis");

const inputSchema = {
  slugs: z
    .array(z.string().min(1))
    .min(2)
    .max(5)
    .describe(
      "Slugs of APIs to compare, e.g. ['resend', 'sendgrid', 'postmark']"
    ),
  criteria: z
    .string()
    .optional()
    .describe(
      "Optional focus area for the comparison, e.g. 'pricing', 'deliverability', 'developer experience'"
    ),
};

export function registerCompareApis(server: McpServer): void {
  server.tool(
    "compare_apis",
    "Compare multiple APIs side-by-side. Provide 2-5 API slugs and an optional criteria focus.",
    inputSchema,
    async ({ slugs, criteria }) => {
      logger.info("compare_apis called", { slugs, criteria });

      try {
        // Look up all requested APIs
        const entries = slugs.map((slug) => {
          const entry = getApiBySlug(slug);
          return { slug, entry };
        });

        // Report any not found
        const notFound = entries.filter((e) => !e.entry).map((e) => e.slug);
        const found = entries.filter(
          (e): e is { slug: string; entry: NonNullable<typeof e.entry> } =>
            e.entry !== null
        );

        if (found.length < 2) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Not enough valid APIs to compare",
                  notFound,
                  suggestion: "Use find_best_api to discover valid API slugs.",
                }),
              },
            ],
          };
        }

        // Build comparison entries
        const comparison = found.map(({ entry }) => {
          const pricingSummary = [
            entry.pricing.freeTier ? `Free: ${entry.pricing.freeTier}` : null,
            entry.pricing.startingPrice
              ? `Paid from ${entry.pricing.startingPrice}`
              : null,
          ]
            .filter(Boolean)
            .join(" | ") || entry.pricing.model;

          // Derive strengths from quality justification + best use cases
          const perfectFits = entry.useCases
            .filter((uc) => uc.fit === "perfect")
            .map((uc) => uc.task);
          const partialFits = entry.useCases
            .filter((uc) => uc.fit === "partial")
            .map((uc) => uc.task);

          const strengths: string[] = [
            ...perfectFits.slice(0, 2),
            entry.sdk.primaryLanguage === "typescript"
              ? "First-class TypeScript SDK"
              : null,
            entry.reliability.uptimeGuarantee
              ? `${entry.reliability.uptimeGuarantee} uptime guarantee`
              : null,
          ].filter((s): s is string => s !== null);

          const weaknesses: string[] = [
            ...partialFits.slice(0, 1).map((t) => `Limited support for: ${t}`),
            ...entry.gotchas.slice(0, 1),
          ].filter(Boolean);

          return {
            name: entry.name,
            slug: entry.slug,
            qualityScore: entry.qualityScore,
            strengths: strengths.slice(0, 4),
            weaknesses: weaknesses.slice(0, 3),
            bestFor: entry.bestFor,
            pricing: pricingSummary,
            pricingModel: entry.pricing.model,
            freeTier: entry.pricing.freeTier ?? "None",
            rateLimits: `${entry.rateLimits.tier}: ${entry.rateLimits.limit}`,
            sdkLanguages: [
              entry.sdk.primaryLanguage,
              ...entry.sdk.otherLanguages,
            ]
              .slice(0, 5)
              .join(", "),
            website: entry.website,
          };
        });

        // Build verdict
        const best = comparison.reduce((a, b) =>
          a.qualityScore >= b.qualityScore ? a : b
        );

        let verdict: string;
        if (criteria) {
          const criteriaLower = criteria.toLowerCase();
          // Pricing-focused verdict
          if (
            criteriaLower.includes("price") ||
            criteriaLower.includes("cost") ||
            criteriaLower.includes("free")
          ) {
            const withFree = comparison.filter((c) => c.freeTier !== "None");
            const cheapest = withFree[0] ?? best;
            verdict = `For ${criteria}, ${cheapest.name} offers the best value with "${cheapest.freeTier}" free tier. ${cheapest.name} is best if staying on a free tier matters most.`;
          } else {
            // Generic criteria verdict — defer to quality score
            verdict = `For ${criteria}, ${best.name} (score: ${best.qualityScore}/10) comes out ahead. ${best.bestFor}.`;
          }
        } else {
          const names = comparison.map((c) => c.name).join(", ");
          verdict = `Of ${names}: ${best.name} scores highest at ${best.qualityScore}/10 — ${best.bestFor}.`;
        }

        const response = {
          comparison,
          verdict,
          notFound: notFound.length > 0 ? notFound : undefined,
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
        logger.error("compare_apis error", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Internal error while comparing APIs",
                details: String(err),
              }),
            },
          ],
        };
      }
    }
  );
}
