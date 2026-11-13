/**
 * Guards for user-facing setup docs (README) and server metadata.
 * The package name and GitHub owner are read from package.json so the docs
 * can't drift from what is actually published.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SERVER_VERSION } from "../../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const readme = readFileSync(join(root, "README.md"), "utf-8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
  name: string;
  version: string;
};
// "@scope/api-oracle" → "scope" (the GitHub owner)
const scope = pkg.name.startsWith("@") ? pkg.name.slice(1).split("/")[0]! : "";

// Allowed until the owner fills them in (prepublishOnly refuses to publish with them)
const PKG_PLACEHOLDER = "FILL_ME_NPM_PACKAGE";
const OWNER_PLACEHOLDER = "FILL_ME_GITHUB_OWNER";

describe("README setup instructions", () => {
  it("documents the Claude Code setup command with the real package name", () => {
    const m = /claude mcp add api-oracle -- npx -y (\S+) serve/.exec(readme);
    expect(m, "missing `claude mcp add api-oracle -- npx -y <pkg> serve`").not.toBeNull();
    expect([pkg.name, PKG_PLACEHOLDER]).toContain(m![1]);
  });

  it("does not tell Claude Code users to edit ~/.claude/claude_desktop_config.json", () => {
    expect(readme).not.toContain("~/.claude/claude_desktop_config.json");
  });

  it("keeps a separate Claude Desktop section with the real config locations", () => {
    expect(readme).toContain("### Claude Desktop");
    expect(readme).toContain("~/Library/Application Support/Claude/claude_desktop_config.json");
  });

  it("CI badge points at the package owner's repository", () => {
    const owners = [...readme.matchAll(/github\.com\/([^/]+)\/api-oracle\/actions\/workflows\/ci\.yml/g)].map(
      (m) => m[1]
    );
    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) expect([scope, OWNER_PLACEHOLDER]).toContain(owner);
  });

  it("documents data freshness and reports held-out eval numbers", () => {
    expect(readme).toContain("## Data freshness");
    expect(readme).toContain("lastVerified");
    expect(readme).toMatch(/holdout/i);
  });
});

describe("server metadata", () => {
  it("reports the package.json version (not a hardcoded one)", () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
