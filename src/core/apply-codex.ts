import fs from "fs-extra";
import { CODEX_AUTH_PATH, CODEX_CONFIG_PATH, CODEX_DIR } from "./paths.js";
import { mergeCodexConfig } from "./merge.js";
import { CodexProfile } from "../types/schema.js";
import { readTomlFile, writeJsonFile, writeTomlFile } from "../utils/fs.js";

export async function applyCodexProfileToNative(profile: CodexProfile): Promise<void> {
  await fs.ensureDir(CODEX_DIR);
  if (profile.config) {
    const existing = (await readTomlFile(CODEX_CONFIG_PATH)) ?? {};
    await writeTomlFile(CODEX_CONFIG_PATH, mergeCodexConfig(existing, profile.config));
  }
  if (profile.auth) {
    await writeJsonFile(CODEX_AUTH_PATH, profile.auth);
  }
}
