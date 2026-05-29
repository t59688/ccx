import { describe, expect, it } from "vitest";
import {
  CCX_REPO_MARKER,
  deriveRepoNameId,
  expandRepoNameInput,
  formatGeneratedRepoName,
  isCcxSyncRepo,
  isGeneratedRepoName
} from "../src/core/github-repo.js";

describe("github-repo naming", () => {
  it("marks repos by exact description", () => {
    expect(isCcxSyncRepo({ description: CCX_REPO_MARKER })).toBe(true);
    expect(isCcxSyncRepo({ description: "ccx-sync-foo" })).toBe(false);
    expect(isCcxSyncRepo({ description: "ccx:preset-sync:v1 extra" })).toBe(false);
  });

  it("generates ccx-rs names with 12 hex id from sha256", () => {
    const name = formatGeneratedRepoName("alice");
    expect(name).toMatch(/^ccx-rs-[a-f0-9]{12}$/);
    expect(deriveRepoNameId("alice")).toHaveLength(12);
    expect(isGeneratedRepoName(name)).toBe(true);
  });

  it("expands manual repo input", () => {
    expect(expandRepoNameInput("bob/ccx-rs-abcdef012345", "bob")).toBe("bob/ccx-rs-abcdef012345");
    expect(expandRepoNameInput("abcdef012345", "bob")).toBe("bob/ccx-rs-abcdef012345");
    expect(expandRepoNameInput("my-repo", "bob")).toBe("bob/my-repo");
  });
});
