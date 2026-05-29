import path from "node:path";
import { BACKUPS_DIR, CLAUDE_CONFIG_PATH, CLAUDE_SETTINGS_PATH, CODEX_AUTH_PATH, CODEX_CONFIG_PATH } from "./paths.js";
import { Agent } from "../types/schema.js";
import { copyIfExists, ensurePrivateDir } from "../utils/fs.js";

export const allNativeAgentFiles = [
  { agent: "claude" as const, label: "Claude settings", path: CLAUDE_SETTINGS_PATH, backupPath: path.join("claude", "settings.json") },
  { agent: "claude" as const, label: "Claude config", path: CLAUDE_CONFIG_PATH, backupPath: path.join("claude", "config.json") },
  { agent: "codex" as const, label: "Codex config", path: CODEX_CONFIG_PATH, backupPath: path.join("codex", "config.toml") },
  { agent: "codex" as const, label: "Codex auth", path: CODEX_AUTH_PATH, backupPath: path.join("codex", "auth.json") }
] as const;

export function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function backupFiles(reason: string, files: readonly { path: string; backupPath: string }[]): Promise<string> {
  const targetDir = path.join(BACKUPS_DIR, `${timestampForPath()}-${reason}`);
  await ensurePrivateDir(targetDir);
  let copied = 0;
  for (const file of files) {
    const target = path.join(targetDir, file.backupPath);
    if (await copyIfExists(file.path, target)) copied += 1;
  }
  return copied === 0 ? "" : targetDir;
}

export async function backupCurrentConfig(reason = "manual"): Promise<string> {
  return backupFiles(reason, allNativeAgentFiles);
}

export async function backupCurrentAgentConfig(agent: Agent, reason = "manual"): Promise<string> {
  return backupFiles(reason, allNativeAgentFiles.filter((file) => file.agent === agent));
}
