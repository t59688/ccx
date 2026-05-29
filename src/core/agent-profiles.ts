import fs from "fs-extra";
import path from "node:path";
import chalk from "chalk";
import { readCurrentSnapshot } from "./agents.js";
import { applyClaudeProfileToNative } from "./apply-claude.js";
import { applyCodexProfileToNative } from "./apply-codex.js";
import { backupCurrentAgentConfig } from "./backup.js";
import { flattenObject } from "./merge.js";
import { agentProfilesDir } from "./paths.js";
import { readState, updateState } from "./state.js";
import {
  Agent,
  AgentProfileMeta,
  AgentProfileMetaSchema,
  ClaudeProfile,
  ClaudeProfileSchema,
  CodexProfile,
  CodexProfileSchema,
} from "../types/schema.js";
import { CcxError } from "../utils/errors.js";
import { t, formatAgent } from "../utils/i18n.js";
import {
  ensurePrivateDir,
  pathExists,
  readJsonFile,
  readTomlFile,
  readYamlFile,
  writeJsonFile,
  writeTomlFile,
  writeYamlFile
} from "../utils/fs.js";
import { redactValue } from "./redact.js";

const NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export type AgentProfile = ClaudeProfile | CodexProfile;

export interface SaveAgentProfileOptions {
  displayName?: string;
  description?: string;
  force?: boolean;
  /** Record as the enabled preset in state (used by `use` and `save`, not `create`). */
  markEnabled?: boolean;
}

export interface ClaudeCreateInput {
  baseUrl?: string;
  authToken?: string;
  model?: string;
  reasoningModel?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
}

export interface CodexCreateInput {
  baseUrl?: string;
  key?: string;
  model?: string;
  modelReasoningEffort?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function validateAgentProfileName(name: string): string {
  const trimmed = name.trim();
  if (!NAME_PATTERN.test(trimmed)) {
    throw new CcxError(t("invalidProfileName", { name }), t("invalidProfileNameHint"));
  }
  return trimmed;
}

export function agentProfileDir(agent: Agent, name: string): string {
  return path.join(agentProfilesDir(agent), validateAgentProfileName(name));
}

function activeKey(agent: Agent): "activeClaudeProfile" | "activeCodexProfile" {
  return agent === "claude" ? "activeClaudeProfile" : "activeCodexProfile";
}

function setIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) target[key] = value.trim();
  else if (typeof value === "boolean") target[key] = value;
}

export function buildClaudeProfile(input: ClaudeCreateInput): ClaudeProfile {
  const env: Record<string, unknown> = {};
  setIfPresent(env, "ANTHROPIC_DEFAULT_OPUS_MODEL", input.opusModel);
  setIfPresent(env, "ANTHROPIC_MODEL", input.model);
  setIfPresent(env, "ANTHROPIC_REASONING_MODEL", input.reasoningModel);
  setIfPresent(env, "ANTHROPIC_DEFAULT_SONNET_MODEL", input.sonnetModel);
  setIfPresent(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL", input.haikuModel);
  setIfPresent(env, "ANTHROPIC_BASE_URL", input.baseUrl);
  setIfPresent(env, "ANTHROPIC_AUTH_TOKEN", input.authToken);

  const settings: Record<string, unknown> = {
    env,
    autoUpdatesChannel: "latest"
  };

  return ClaudeProfileSchema.parse({ settings });
}

export function extractClaudeProfileInput(profile?: ClaudeProfile): ClaudeCreateInput {
  const env = profile?.settings?.env && typeof profile.settings.env === "object"
    ? profile.settings.env as Record<string, unknown>
    : {};
  return {
    baseUrl: str(env.ANTHROPIC_BASE_URL),
    authToken: str(env.ANTHROPIC_AUTH_TOKEN),
    model: str(env.ANTHROPIC_MODEL),
    reasoningModel: str(env.ANTHROPIC_REASONING_MODEL),
    haikuModel: str(env.ANTHROPIC_DEFAULT_HAIKU_MODEL),
    sonnetModel: str(env.ANTHROPIC_DEFAULT_SONNET_MODEL),
    opusModel: str(env.ANTHROPIC_DEFAULT_OPUS_MODEL)
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function extractCodexProfileInput(profile?: CodexProfile): CodexCreateInput {
  const config = profile?.config ?? {};
  const providerKey = typeof config.model_provider === "string" ? config.model_provider : "custom";
  const providers = config.model_providers && typeof config.model_providers === "object"
    ? config.model_providers as Record<string, Record<string, unknown>>
    : {};
  const providerConfig = providers[providerKey] ?? providers.custom ?? {};
  return {
    baseUrl: str(providerConfig.base_url),
    key: str(profile?.auth?.OPENAI_API_KEY),
    model: str(config.model),
    modelReasoningEffort: str(config.model_reasoning_effort)
  };
}

export function buildCodexProfile(input: CodexCreateInput): CodexProfile {
  const provider = "custom";
  const providerConfig: Record<string, unknown> = { name: "custom" };
  setIfPresent(providerConfig, "base_url", input.baseUrl);
  providerConfig.wire_api = "responses";
  providerConfig.requires_openai_auth = true;

  const config: Record<string, unknown> = {
    model_provider: provider,
    disable_response_storage: true,
    model_providers: {
      [provider]: providerConfig
    }
  };
  setIfPresent(config, "model", input.model);
  setIfPresent(config, "model_reasoning_effort", input.modelReasoningEffort);

  const auth: Record<string, unknown> = {};
  setIfPresent(auth, "OPENAI_API_KEY", input.key);

  const profile: CodexProfile = { config };
  if (Object.keys(auth).length > 0) profile.auth = auth;
  return CodexProfileSchema.parse(profile);
}

export async function listAgentProfiles(agent: Agent): Promise<AgentProfileMeta[]> {
  const base = agentProfilesDir(agent);
  await ensurePrivateDir(base);
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  const metas: AgentProfileMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await loadAgentProfileMeta(agent, entry.name).catch(() => undefined);
    if (meta) metas.push(meta);
  }
  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}

export async function loadAgentProfileMeta(agent: Agent, name: string): Promise<AgentProfileMeta | undefined> {
  const metaPath = path.join(agentProfileDir(agent, name), "meta.yaml");
  const meta = await readYamlFile<unknown>(metaPath);
  return meta ? AgentProfileMetaSchema.parse(meta) : undefined;
}

export async function loadAgentProfile(agent: "claude", name: string): Promise<ClaudeProfile>;
export async function loadAgentProfile(agent: "codex", name: string): Promise<CodexProfile>;
export async function loadAgentProfile(agent: Agent, name: string): Promise<AgentProfile> {
  const dir = agentProfileDir(agent, name);
  if (!(await pathExists(dir))) throw new CcxError(t("profileNotFound", { agent: formatAgent(agent), name }));
  if (agent === "claude") {
    const settings = await readJsonFile<Record<string, unknown>>(path.join(dir, "settings.json"));
    const config = await readJsonFile<Record<string, unknown>>(path.join(dir, "config.json"));
    const profile: ClaudeProfile = {};
    if (settings) profile.settings = settings;
    if (config) profile.config = config;
    return ClaudeProfileSchema.parse(profile);
  }
  const config = await readTomlFile(path.join(dir, "config.toml"));
  const auth = await readJsonFile<Record<string, unknown>>(path.join(dir, "auth.json"));
  const profile: CodexProfile = {};
  if (config) profile.config = config;
  if (auth) profile.auth = auth;
  return CodexProfileSchema.parse(profile);
}

export async function saveAgentProfile(
  agent: "claude",
  name: string,
  profile: ClaudeProfile,
  options?: SaveAgentProfileOptions
): Promise<AgentProfileMeta>;
export async function saveAgentProfile(
  agent: "codex",
  name: string,
  profile: CodexProfile,
  options?: SaveAgentProfileOptions
): Promise<AgentProfileMeta>;
export async function saveAgentProfile(
  agent: Agent,
  name: string,
  profile: AgentProfile,
  options: SaveAgentProfileOptions = {}
): Promise<AgentProfileMeta> {
  const validName = validateAgentProfileName(name);
  const dir = agentProfileDir(agent, validName);
  const exists = await pathExists(dir);
  if (exists && !options.force) throw new CcxError(t("profileAlreadyExists", { agent: formatAgent(agent), name: validName }), t("profileAlreadyExistsHint"));

  await ensurePrivateDir(dir);
  const previousMeta = exists ? await loadAgentProfileMeta(agent, validName).catch(() => undefined) : undefined;
  const meta = AgentProfileMetaSchema.parse({
    name: validName,
    displayName: options.displayName ?? previousMeta?.displayName,
    description: options.description ?? previousMeta?.description,
    agent,
    createdAt: previousMeta?.createdAt ?? nowIso(),
    updatedAt: nowIso()
  });

  if (agent === "claude") {
    const claude = ClaudeProfileSchema.parse(profile);
    await fs.remove(path.join(dir, "settings.json"));
    await fs.remove(path.join(dir, "config.json"));
    if (claude.settings) await writeJsonFile(path.join(dir, "settings.json"), claude.settings);
    if (claude.config) await writeJsonFile(path.join(dir, "config.json"), claude.config);
  } else {
    const codex = CodexProfileSchema.parse(profile);
    await fs.remove(path.join(dir, "config.toml"));
    await fs.remove(path.join(dir, "auth.json"));
    if (codex.config) await writeTomlFile(path.join(dir, "config.toml"), codex.config);
    if (codex.auth) await writeJsonFile(path.join(dir, "auth.json"), codex.auth);
  }
  await writeYamlFile(path.join(dir, "meta.yaml"), meta);
  if (options.markEnabled) await updateState({ [activeKey(agent)]: validName });
  return meta;
}

export async function saveCurrentAgentProfile(
  agent: Agent,
  name: string,
  options: SaveAgentProfileOptions = {}
): Promise<AgentProfileMeta> {
  const snapshot = await readCurrentSnapshot();
  const saveOptions = { ...options, markEnabled: options.markEnabled ?? true };
  if (agent === "claude") {
    if (!snapshot.claude) throw new CcxError(t("noClaudeToSave"));
    return saveAgentProfile("claude", name, snapshot.claude, saveOptions);
  }
  if (!snapshot.codex) throw new CcxError(t("noCodexToSave"));
  return saveAgentProfile("codex", name, snapshot.codex, saveOptions);
}

export async function applyAgentProfile(agent: Agent, name: string, options: { backup?: boolean; dryRun?: boolean } = {}): Promise<void> {
  const profile = await loadAgentProfile(agent as never, name) as AgentProfile;
  if (options.dryRun) return;
  if (options.backup !== false) {
    const backupDir = await backupCurrentAgentConfig(agent, `before-use-${agent}-${name}`);
    if (backupDir) console.log(chalk.gray(t("agentBackup", { path: backupDir })));
  }
  if (agent === "claude") await applyClaudeProfileToNative(profile as ClaudeProfile);
  else await applyCodexProfileToNative(profile as CodexProfile);
  await updateState({ [activeKey(agent)]: name });
}

export async function removeAgentProfile(agent: Agent, name: string): Promise<void> {
  const dir = agentProfileDir(agent, name);
  if (!(await pathExists(dir))) throw new CcxError(t("profileNotFound", { agent: formatAgent(agent), name }));
  await fs.remove(dir);
  const state = await readState();
  if (state[activeKey(agent)] === name) await updateState({ [activeKey(agent)]: undefined });
}

export async function allAgentProfileCount(): Promise<number> {
  const [claude, codex] = await Promise.all([listAgentProfiles("claude"), listAgentProfiles("codex")]);
  return claude.length + codex.length;
}

function safeJson(key: string, value: unknown): string {
  if (/(token|key|secret|password|credential|auth)/i.test(key)) return JSON.stringify(redactValue(value));
  return JSON.stringify(value);
}

export async function printAgentDiff(agent: Agent, name: string): Promise<void> {
  const current = await readCurrentSnapshot();
  const currentAgent = agent === "claude" ? current.claude : current.codex;
  const target = await loadAgentProfile(agent as never, name) as AgentProfile;
  const left = flattenObject(currentAgent ?? {});
  const right = flattenObject(target);
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  let changes = 0;
  for (const key of keys) {
    if (safeJson(key, left[key]) === safeJson(key, right[key])) continue;
    changes += 1;
    console.log(chalk.bold(key));
    console.log(chalk.red(`  local:   ${safeJson(key, left[key])}`));
    console.log(chalk.green(`  profile: ${safeJson(key, right[key])}`));
  }
  if (changes === 0) console.log(chalk.green(t("agentCurrentMatches", { agent: formatAgent(agent), name })));
}
