/**
 * MCP Tool: get_api_setup_guide
 * Returns detailed, step-by-step setup instructions for a specific API.
 *
 * Exports: registerGetSetupGuide
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiBySlug } from "../knowledge/search.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("tool:get-setup-guide");

const inputSchema = {
  slug: z.string().min(1).describe(
    "The API slug to get setup instructions for, e.g. 'resend', 'stripe', 'clerk'"
  ),
  language: z
    .string()
    .optional()
    .describe(
      "Preferred language for code examples (default: 'typescript'). Must be a language the API supports."
    ),
};

export function registerGetSetupGuide(server: McpServer): void {
  server.tool(
    "get_api_setup_guide",
    "Get complete, step-by-step setup instructions for a specific API including install command, auth setup, and working code examples.",
    inputSchema,
    async ({ slug, language }) => {
      logger.info("get_api_setup_guide called", { slug, language });

      try {
        const entry = getApiBySlug(slug);

        if (!entry) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `API '${slug}' not found in the knowledge base`,
                  suggestion:
                    "Use find_best_api to discover available APIs and their slugs.",
                }),
              },
            ],
          };
        }

        const targetLanguage = (language ?? "typescript").toLowerCase();

        // Select appropriate code examples
        const allExamples = entry.codeExamples;
        const languageExamples = allExamples.filter(
          (ex) => ex.language.toLowerCase() === targetLanguage
        );
        const examples = languageExamples.length > 0 ? languageExamples : allExamples;

        // Check if the requested language is supported
        const supportedLanguages = [
          entry.sdk.primaryLanguage,
          ...entry.sdk.otherLanguages,
        ];
        const isLanguageSupported = supportedLanguages.some(
          (l) => l.toLowerCase() === targetLanguage
        );

        // Build the full code example (all examples concatenated with titles)
        const fullCodeExample =
          examples.length > 0
            ? examples
                .map(
                  (ex) =>
                    `// === ${ex.title} ===\n${ex.code}${ex.notes ? `\n// NOTE: ${ex.notes}` : ""}`
                )
                .join("\n\n")
            : "// See documentation at " + entry.website;

        // Build rate limit warning
        const rateLimitWarning = `${entry.rateLimits.tier}: ${entry.rateLimits.limit}. ${entry.rateLimits.notes}. Retry strategy: ${entry.rateLimits.retryStrategy}`;

        // Build pricing summary
        const pricingParts = [
          entry.pricing.freeTier ? `Free tier: ${entry.pricing.freeTier}` : null,
          entry.pricing.startingPrice ? `Paid: ${entry.pricing.startingPrice}` : null,
          entry.pricing.costPer ? `Per unit: ${entry.pricing.costPer}` : null,
        ].filter(Boolean);

        const response = {
          name: entry.name,
          slug: entry.slug,
          website: entry.website,
          category: entry.category,
          description: entry.description,

          // Auth setup
          setupSteps: entry.auth.setupSteps,
          envVarName: entry.auth.envVarName,
          authMethod: entry.auth.method,
          authCodeSnippet: entry.auth.codeSnippet,

          // SDK info
          installCommand: entry.sdk.installCommand,
          importStatement: entry.sdk.importStatement,
          supportedLanguages,

          // Language warning if not supported
          languageNote: !isLanguageSupported
            ? `Note: ${entry.name} does not have an official ${targetLanguage} SDK. Showing ${entry.sdk.primaryLanguage} examples instead. Community clients may exist.`
            : null,

          // Code
          codeExamples: examples.map((ex) => ({
            title: ex.title,
            language: ex.language,
            code: ex.code,
            notes: ex.notes,
          })),
          fullCodeExample,

          // Practical info
          gotchas: entry.gotchas,
          rateLimitWarning,
          pricing: pricingParts.join(". "),
          pricingUrl: entry.pricing.pricingUrl,

          // Reliability
          uptimeGuarantee: entry.reliability.uptimeGuarantee,
          statusPage: entry.reliability.statusPageUrl,

          // Related
          alternatives: entry.alternatives,
          complementaryApis: entry.complementary,

          // Meta
          qualityScore: entry.qualityScore,
          lastVerified: entry.lastVerified,
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
        logger.error("get_api_setup_guide error", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Internal error while fetching setup guide",
                details: String(err),
              }),
            },
          ],
        };
      }
    }
  );
}
