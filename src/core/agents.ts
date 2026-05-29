import fs from "fs-extra";
import path from "node:path";
import {
  CLAUDE_CONFIG_PATH,
  CLAUDE_DIR,
  CLAUDE_SETTINGS_PATH,
  CODEX_AUTH_PATH,
  CODEX_CONFIG_PATH,
  CODEX_DIR
} from "./paths.js";
import { extractCodexProfileConfig, mergeClaudeSettings, mergeCodexConfig } from "./merge.js";
import { FullSnapshot } from "../types/schema.js";
import { readJsonFile, readTomlFile, writeJsonFile, writeTomlFile } from "../utils/fs.js";

function nonEmptyObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

export async function readCurrentSnapshot(): Promise<FullSnapshot> {
  const snapshot: FullSnapshot = {};
  const claudeSettings = await readJsonFile<Record<string, unknown>>(CLAUDE_SETTINGS_PATH);
  const claudeConfig = await readJsonFile<Record<string, unknown>>(CLAUDE_CONFIG_PATH);
  if (nonEmptyObject(claudeSettings) || nonEmptyObject(claudeConfig)) {
    snapshot.claude = {};
    if (nonEmptyObject(claudeSettings)) snapshot.claude.settings = claudeSettings;
    if (nonEmptyObject(claudeConfig)) snapshot.claude.config = claudeConfig;
  }

  const codexConfig = await readTomlFile(CODEX_CONFIG_PATH);
  const codexAuth = await readJsonFile<Record<string, unknown>>(CODEX_AUTH_PATH);
  const extractedCodexConfig = codexConfig ? extractCodexProfileConfig(codexConfig) : undefined;
  if (nonEmptyObject(extractedCodexConfig) || nonEmptyObject(codexAuth)) {
    snapshot.codex = {};
    if (nonEmptyObject(extractedCodexConfig)) snapshot.codex.config = extractedCodexConfig;
    if (nonEmptyObject(codexAuth)) snapshot.codex.auth = codexAuth;
  }
  return snapshot;
}

export async function applySnapshot(snapshot: FullSnapshot): Promise<void> {
  if (snapshot.claude?.settings) {
    await fs.ensureDir(CLAUDE_DIR);
    const existing = (await readJsonFile<Record<string, unknown>>(CLAUDE_SETTINGS_PATH)) ?? {};
    await writeJsonFile(CLAUDE_SETTINGS_PATH, mergeClaudeSettings(existing, snapshot.claude.settings));
  }
  if (snapshot.claude?.config) {
    await fs.ensureDir(CLAUDE_DIR);
    const existing = (await readJsonFile<Record<string, unknown>>(CLAUDE_CONFIG_PATH)) ?? {};
    await writeJsonFile(CLAUDE_CONFIG_PATH, { ...existing, ...snapshot.claude.config });
  }

  if (snapshot.codex?.config) {
    await fs.ensureDir(CODEX_DIR);
    const existing = (await readTomlFile(CODEX_CONFIG_PATH)) ?? {};
    await writeTomlFile(CODEX_CONFIG_PATH, mergeCodexConfig(existing, snapshot.codex.config));
  }
  if (snapshot.codex?.auth) {
    await fs.ensureDir(CODEX_DIR);
    await writeJsonFile(CODEX_AUTH_PATH, snapshot.codex.auth);
  }
}

export const agentFiles = [
  { label: "Claude settings", path: CLAUDE_SETTINGS_PATH },
  { label: "Claude config", path: CLAUDE_CONFIG_PATH },
  { label: "Codex config", path: CODEX_CONFIG_PATH },
  { label: "Codex auth", path: CODEX_AUTH_PATH }
] as const;

export function relativeAgentBackupPath(filePath: string): string {
  if (filePath === CLAUDE_SETTINGS_PATH) return path.join("claude", "settings.json");
  if (filePath === CLAUDE_CONFIG_PATH) return path.join("claude", "config.json");
  if (filePath === CODEX_CONFIG_PATH) return path.join("codex", "config.toml");
  if (filePath === CODEX_AUTH_PATH) return path.join("codex", "auth.json");
  return path.basename(filePath);
}
