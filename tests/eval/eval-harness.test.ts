/**
 * Tests for the eval harness (scripts/eval.ts) and the integrity of the
 * dev / holdout query sets. These do NOT assert accuracy numbers — the eval
 * is a measurement, run with `npm run eval`.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateQuery,
  evaluateSet,
  loadEvalSet,
  summaryRow,
  type EvalSet,
} from "../../scripts/eval.js";
import { loadEntriesFromDir, resolveEntriesDir } from "../../src/knowledge/loader.js";

const knownSlugs = new Set(loadEntriesFromDir(resolveEntriesDir()).entries.map((e) => e.slug));
const dev = loadEvalSet("dev");
const holdout = loadEvalSet("holdout");

describe("eval query sets", () => {
  it("have the intended sizes", () => {
    expect(dev.queries.length).toBeGreaterThanOrEqual(25);
    expect(holdout.queries.length).toBeGreaterThanOrEqual(40);
  });

  it.each([
    ["dev", dev],
    ["holdout", holdout],
  ] as const)("%s: ids are unique and every slug exists in the knowledge base", (_name, set) => {
    const ids = set.queries.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of set.queries) {
      expect(q.acceptableTop1.length, q.id).toBeGreaterThan(0);
      for (const slug of [...q.acceptableTop1, ...(q.mustNotTop3 ?? [])]) {
        expect(knownSlugs.has(slug), `${q.id}: unknown slug ${slug}`).toBe(true);
      }
      // A slug can't be both acceptable and forbidden
      const forbidden = new Set(q.mustNotTop3 ?? []);
      expect(q.acceptableTop1.some((s) => forbidden.has(s)), q.id).toBe(false);
    }
  });

  it("holdout shares no queries with dev", () => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const devQueries = new Set(dev.queries.map((q) => norm(q.query)));
    for (const q of holdout.queries) {
      expect(devQueries.has(norm(q.query)), q.id).toBe(false);
    }
  });

  it("dev includes all five reviewer-reported failures", () => {
    const queries = dev.queries.map((q) => q.query);
    for (const q of [
      "store user uploaded images and resize them",
      "speech to text transcription",
      "generate images from text",
      "send transactional emails",
      "full text search for my product catalog",
    ]) {
      expect(queries).toContain(q);
    }
  });
});

describe("eval metrics", () => {
  const q = { id: "x", query: "q", acceptableTop1: ["a", "b"], mustNotTop3: ["z"] };

  it("scores top-1, top-3 and violations", () => {
    expect(evaluateQuery(q, ["a", "c", "d"])).toMatchObject({ top1Hit: true, top3Hit: true, violations: [] });
    expect(evaluateQuery(q, ["c", "b", "z"])).toMatchObject({ top1Hit: false, top3Hit: true, violations: ["z"] });
    expect(evaluateQuery(q, ["c", "d", "e", "a"])).toMatchObject({ top1Hit: false, top3Hit: false });
    expect(evaluateQuery(q, [])).toMatchObject({ top1Hit: false, top3Hit: false, violations: [] });
  });

  it("aggregates a set; violation rate only counts queries with a must-not list", () => {
    const set: EvalSet = {
      name: "t",
      queries: [
        { id: "1", query: "one", acceptableTop1: ["a"], mustNotTop3: ["z"] },
        { id: "2", query: "two", acceptableTop1: ["b"] },
      ],
    };
    const rank = (query: string) => (query === "one" ? ["a", "z"] : ["c", "b"]);
    const r = evaluateSet(set, rank);
    expect(r).toMatchObject({ total: 2, top1Correct: 1, top3Correct: 2, mustNotQueries: 1, violatingQueries: 1 });
    expect(summaryRow(r)).toBe("| t | 2 | 1/2 (50.0%) | 2/2 (100.0%) | 1/1 (100.0%) |");
  });
});
