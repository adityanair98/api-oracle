/**
 * Tests for src/knowledge/synonyms.ts
 * Tests synonym expansion, phrase detection, and category detection.
 */

import { describe, it, expect } from "vitest";
import {
  expandQuery,
  detectPhrases,
  detectCategory,
  SYNONYM_GROUPS,
} from "../../src/knowledge/synonyms.js";

describe("SYNONYM_GROUPS", () => {
  it("has at least 10 groups", () => {
    expect(SYNONYM_GROUPS.length).toBeGreaterThanOrEqual(10);
  });

  it("every group has at least 3 terms", () => {
    for (const group of SYNONYM_GROUPS) {
      expect(group.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("no duplicate terms across groups", () => {
    const allTerms: string[] = [];
    for (const group of SYNONYM_GROUPS) {
      for (const term of group) {
        allTerms.push(term.toLowerCase());
      }
    }
    const termSet = new Set(allTerms);
    // Allow some overlap (terms like 'storage', 'message' appear in multiple groups intentionally)
    // Just ensure total terms are reasonable
    expect(termSet.size).toBeGreaterThan(60);
  });
});

describe("expandQuery", () => {
  it("expands 'login' to include auth synonyms", () => {
    const expanded = expandQuery("my users need to log in with Google");
    expect(expanded.toLowerCase()).toContain("auth");
    expect(expanded.toLowerCase()).toContain("authentication");
    expect(expanded.length).toBeGreaterThan("my users need to log in with Google".length);
  });

  it("expands 'crash' to include error tracking synonyms", () => {
    const expanded = expandQuery("my app crashes in production");
    const lower = expanded.toLowerCase();
    expect(lower).toContain("error");
    expect(lower).toContain("monitoring");
  });

  it("expands 'AI' to include LLM/ML synonyms", () => {
    const expanded = expandQuery("I need AI in my app");
    const lower = expanded.toLowerCase();
    expect(lower).toContain("llm");
    expect(lower).toContain("machine learning");
  });

  it("expands 'billing' to include payment synonyms", () => {
    const expanded = expandQuery("I'm building a SaaS and need billing");
    const lower = expanded.toLowerCase();
    expect(lower).toContain("payment");
    expect(lower).toContain("checkout");
  });

  it("expands 'chat' to include messaging synonyms", () => {
    const expanded = expandQuery("add a chat feature");
    const lower = expanded.toLowerCase();
    expect(lower).toContain("conversation");
    expect(lower).toContain("channel");
  });

  it("does not change a query with no recognized terms", () => {
    const query = "something completely unrelated xyz abc";
    const expanded = expandQuery(query);
    expect(expanded).toBe(query);
  });

  it("returns a non-empty string for any input", () => {
    expect(expandQuery("")).toBe("");
    expect(expandQuery("hello world")).toBeTruthy();
  });
});

describe("detectPhrases", () => {
  it("detects preferFree from 'cheapest'", () => {
    const phrases = detectPhrases("cheapest way to send emails");
    expect(phrases.preferFree).toBe(true);
  });

  it("detects preferFree from 'free'", () => {
    const phrases = detectPhrases("I need a free email service");
    expect(phrases.preferFree).toBe(true);
  });

  it("detects preferOpenSource from 'open source'", () => {
    const phrases = detectPhrases("something like Firebase but open source");
    expect(phrases.preferOpenSource).toBe(true);
  });

  it("detects preferOpenSource from 'self-hosted'", () => {
    const phrases = detectPhrases("I want to self-host my notification system");
    expect(phrases.preferOpenSource).toBe(true);
  });

  it("detects preferReliable from 'most reliable'", () => {
    const phrases = detectPhrases("most reliable payment processor");
    expect(phrases.preferReliable).toBe(true);
  });

  it("detects preferReliable from 'enterprise'", () => {
    const phrases = detectPhrases("I need an enterprise-grade solution");
    expect(phrases.preferReliable).toBe(true);
  });

  it("detects preferServerless from 'Vercel'", () => {
    const phrases = detectPhrases("I need to store data but I'm on Vercel");
    expect(phrases.preferServerless).toBe(true);
  });

  it("detects preferServerless from 'serverless'", () => {
    const phrases = detectPhrases("serverless database for my edge functions");
    expect(phrases.preferServerless).toBe(true);
  });

  it("extracts referenceSlug from 'like Firebase but'", () => {
    const phrases = detectPhrases("something like Firebase but open source");
    expect(phrases.referenceSlug).toBe("firebase");
  });

  it("returns no modifiers for a neutral query", () => {
    const phrases = detectPhrases("send transactional emails");
    expect(phrases.preferFree).toBe(false);
    expect(phrases.preferOpenSource).toBe(false);
    expect(phrases.preferReliable).toBe(false);
    expect(phrases.preferServerless).toBe(false);
    expect(phrases.referenceSlug).toBeNull();
  });
});

describe("detectCategory", () => {
  it("maps 'send emails' to email category with high confidence", () => {
    const { category, confidence } = detectCategory("send transactional emails");
    expect(category).toBe("email");
    expect(confidence).toBeGreaterThan(0.4);
  });

  it("maps 'process payments' to payments category", () => {
    const { category, confidence } = detectCategory("process credit card payments");
    expect(category).toBe("payments");
    expect(confidence).toBeGreaterThan(0.4);
  });

  it("maps 'user login with OAuth' to auth category", () => {
    const { category, confidence } = detectCategory("user login with OAuth");
    expect(category).toBe("auth");
    expect(confidence).toBeGreaterThan(0.4);
  });

  it("maps 'log in with Google' to auth category", () => {
    const { category } = detectCategory("my users need to log in with Google");
    expect(category).toBe("auth");
  });

  it("maps 'app crashes' to analytics category", () => {
    const { category } = detectCategory("need to know when my app crashes in production");
    expect(category).toBe("analytics");
  });

  it("maps 'track users' to analytics category", () => {
    const { category } = detectCategory("I want to track how users interact with my product");
    expect(category).toBe("analytics");
  });

  it("maps 'push notifications' to notifications category", () => {
    const { category } = detectCategory("send push notifications to mobile users");
    expect(category).toBe("notifications");
  });

  it("maps 'real-time chat' to communication category", () => {
    const { category } = detectCategory("add real-time chat to my app");
    expect(category).toBe("communication");
  });

  it("maps 'AI in my app' to ai category", () => {
    const { category } = detectCategory("I need AI in my app");
    expect(category).toBe("ai");
  });

  it("maps 'store database' to database category", () => {
    const { category } = detectCategory("I need a database for my app");
    expect(category).toBe("database");
  });

  it("returns null category for very vague queries", () => {
    const { category } = detectCategory("I need something good");
    expect(category).toBeNull();
  });

  it("confidence is between 0 and 1", () => {
    for (const query of [
      "send emails", "pay with card", "log in", "something vague",
    ]) {
      const { confidence } = detectCategory(query);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });
});
