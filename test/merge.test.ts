import { describe, expect, it } from "vitest";
import { mergeClaudeSettings, mergeCodexConfig } from "../src/core/merge.js";

describe("mergeClaudeSettings", () => {
  it("replaces provider env and preserves unrelated settings", () => {
    const result = mergeClaudeSettings(
      { permissions: { allow: ["Bash(ls)"] }, env: { ANTHROPIC_BASE_URL: "old", FOO: "bar" } },
      { model: "opus", env: { ANTHROPIC_BASE_URL: "new", ANTHROPIC_AUTH_TOKEN: "secret" } }
    );
    expect(result.permissions).toEqual({ allow: ["Bash(ls)"] });
    expect(result.env).toEqual({ FOO: "bar", ANTHROPIC_BASE_URL: "new", ANTHROPIC_AUTH_TOKEN: "secret" });
  });
});

describe("mergeCodexConfig", () => {
  it("merges model providers and preserves local sections", () => {
    const result = mergeCodexConfig(
      { projects: { a: true }, model_providers: { old: { base_url: "old" } } },
      { model_provider: "new", model: "gpt", model_providers: { new: { base_url: "new" } } }
    );
    expect(result.projects).toEqual({ a: true });
    expect(result.model_providers).toEqual({ old: { base_url: "old" }, new: { base_url: "new" } });
  });
});
