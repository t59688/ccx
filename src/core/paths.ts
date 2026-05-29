import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { Agent } from "../types/schema.js";

export const HOME = os.homedir();

export const CCX_DIR = path.join(HOME, ".ccx");
export const AGENT_PROFILES_DIR = path.join(CCX_DIR, "agents"); // preferred per-agent profiles
export const BACKUPS_DIR = path.join(CCX_DIR, "backups");
export const STATE_PATH = path.join(CCX_DIR, "state.yaml");

export const CLAUDE_DIR = path.join(HOME, ".claude");
export const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
export const CLAUDE_CONFIG_PATH = path.join(CLAUDE_DIR, "config.json");

export const CODEX_DIR = path.join(HOME, ".codex");
export const CODEX_CONFIG_PATH = path.join(CODEX_DIR, "config.toml");
export const CODEX_AUTH_PATH = path.join(CODEX_DIR, "auth.json");

export const DEFAULT_GITHUB_PATH = ".ccx/profiles.enc.json";

export async function ensureDataDir(): Promise<void> {
  await fs.ensureDir(CCX_DIR);
}

export function agentProfilesDir(agent: Agent): string {
  return path.join(AGENT_PROFILES_DIR, agent);
}
