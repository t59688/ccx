import { describe, expect, it } from "vitest";
import { buildClaudeProfile, buildCodexProfile } from "../src/core/agent-profiles.js";

const get = (value: unknown) => value as Record<string, unknown>;

describe("agent profile builders", () => {
  it("builds the simplified Codex config", () => {
    const profile = buildCodexProfile({ baseUrl: "https://icoe.pp.ua", key: "sk-222", model: "gpt-5.4" });
    expect(profile.auth).toEqual({ OPENAI_API_KEY: "sk-222" });
    expect(profile.config).toMatchObject({
      model_provider: "custom",
      model: "gpt-5.4",
      disable_response_storage: true
    });
    expect(profile.config?.model_reasoning_effort).toBeUndefined();
    const providers = get(profile.config?.model_providers);
    expect(providers.custom).toEqual({
      name: "custom",
      base_url: "https://icoe.pp.ua",
      wire_api: "responses",
      requires_openai_auth: true
    });
  });

  it("builds Codex config with model_reasoning_effort when provided", () => {
    const profile = buildCodexProfile({
      baseUrl: "https://gw.example",
      key: "sk-test",
      model: "gpt-5.5",
      modelReasoningEffort: "xhigh"
    });
    expect(profile.config?.model_reasoning_effort).toBe("xhigh");
  });

  it("builds the simplified Claude settings", () => {
    const profile = buildClaudeProfile({
      baseUrl: "http://xxx",
      authToken: "123132",
      model: "xx1",
      reasoningModel: "xx2",
      haikuModel: "xx3",
      sonnetModel: "xx4",
      opusModel: "xx5"
    });
    expect(profile.settings).toEqual({
      env: {
        ANTHROPIC_DEFAULT_OPUS_MODEL: "xx5",
        ANTHROPIC_MODEL: "xx1",
        ANTHROPIC_REASONING_MODEL: "xx2",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "xx4",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "xx3",
        ANTHROPIC_BASE_URL: "http://xxx",
        ANTHROPIC_AUTH_TOKEN: "123132"
      },
      autoUpdatesChannel: "latest"
    });
  });
});
