import fs from "fs-extra";
import { CLAUDE_CONFIG_PATH, CLAUDE_DIR, CLAUDE_SETTINGS_PATH } from "./paths.js";
import { mergeClaudeSettings } from "./merge.js";
import { ClaudeProfile } from "../types/schema.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

export async function applyClaudeProfileToNative(profile: ClaudeProfile): Promise<void> {
  await fs.ensureDir(CLAUDE_DIR);
  if (profile.settings) {
    const existing = (await readJsonFile<Record<string, unknown>>(CLAUDE_SETTINGS_PATH)) ?? {};
    await writeJsonFile(CLAUDE_SETTINGS_PATH, mergeClaudeSettings(existing, profile.settings));
  }
  if (profile.config) {
    const existing = (await readJsonFile<Record<string, unknown>>(CLAUDE_CONFIG_PATH)) ?? {};
    await writeJsonFile(CLAUDE_CONFIG_PATH, { ...existing, ...profile.config });
  }
}
