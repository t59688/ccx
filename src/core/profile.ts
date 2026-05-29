import fs from "fs-extra";
import path from "node:path";
import { CCX_DIR, PROFILES_DIR } from "./paths.js";
import { readState, updateState } from "./state.js";
import { FullSnapshot, FullSnapshotSchema, ProfileMeta, ProfileMetaSchema } from "../types/schema.js";
import { CcxError } from "../utils/errors.js";
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

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function validateProfileName(name: string): string {
  const trimmed = name.trim();
  if (!PROFILE_NAME_PATTERN.test(trimmed)) {
    throw new CcxError(
      `Invalid profile name: ${name}`,
      "Use letters, numbers, dot, underscore, or dash only."
    );
  }
  return trimmed;
}

export function profileDir(profile: string): string {
  return path.join(PROFILES_DIR, validateProfileName(profile));
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function loadProfileMeta(name: string): Promise<ProfileMeta | undefined> {
  const metaPath = path.join(profileDir(name), "meta.yaml");
  const meta = await readYamlFile<unknown>(metaPath);
  return meta ? ProfileMetaSchema.parse(meta) : undefined;
}

export async function listProfiles(): Promise<ProfileMeta[]> {
  await ensurePrivateDir(PROFILES_DIR);
  const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true }).catch(() => []);
  const metas: ProfileMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await loadProfileMeta(entry.name).catch(() => undefined);
    if (meta) metas.push(meta);
  }
  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}

export async function loadProfile(name: string): Promise<FullSnapshot> {
  const dir = profileDir(name);
  if (!(await pathExists(dir))) throw new CcxError(`Profile not found: ${name}`);
  const claude = await readJsonFile<Record<string, unknown>>(path.join(dir, "claude.json"));
  const codexConfig = await readTomlFile(path.join(dir, "codex.toml"));
  const codexAuth = await readJsonFile<Record<string, unknown>>(path.join(dir, "codex-auth.json"));
  const snapshot: FullSnapshot = {};
  if (claude) snapshot.claude = claude as FullSnapshot["claude"];
  if (codexConfig || codexAuth) snapshot.codex = { config: codexConfig, auth: codexAuth };
  return FullSnapshotSchema.parse(snapshot);
}

export async function saveProfile(
  name: string,
  snapshot: FullSnapshot,
  options: { displayName?: string; description?: string; force?: boolean } = {}
): Promise<ProfileMeta> {
  await ensurePrivateDir(CCX_DIR);
  await ensurePrivateDir(PROFILES_DIR);
  const validName = validateProfileName(name);
  const dir = profileDir(validName);
  const exists = await pathExists(dir);
  if (exists && !options.force) {
    throw new CcxError(`Profile already exists: ${validName}`, "Use --force to overwrite it.");
  }
  await ensurePrivateDir(dir);
  const previousMeta = exists ? await loadProfileMeta(validName).catch(() => undefined) : undefined;
  const agents = [
    ...(snapshot.claude ? ["claude" as const] : []),
    ...(snapshot.codex ? ["codex" as const] : [])
  ];
  const meta: ProfileMeta = ProfileMetaSchema.parse({
    name: validName,
    displayName: options.displayName ?? previousMeta?.displayName,
    description: options.description ?? previousMeta?.description,
    agents,
    createdAt: previousMeta?.createdAt ?? nowIso(),
    updatedAt: nowIso()
  });

  await fs.remove(path.join(dir, "claude.json"));
  await fs.remove(path.join(dir, "codex.toml"));
  await fs.remove(path.join(dir, "codex-auth.json"));

  if (snapshot.claude) await writeJsonFile(path.join(dir, "claude.json"), snapshot.claude);
  if (snapshot.codex?.config) await writeTomlFile(path.join(dir, "codex.toml"), snapshot.codex.config);
  if (snapshot.codex?.auth) await writeJsonFile(path.join(dir, "codex-auth.json"), snapshot.codex.auth);
  await writeYamlFile(path.join(dir, "meta.yaml"), meta);
  await updateState({ activeProfile: validName });
  return meta;
}

export async function updateProfileMeta(name: string, update: Partial<ProfileMeta>): Promise<ProfileMeta> {
  const old = await loadProfileMeta(name);
  if (!old) throw new CcxError(`Profile not found: ${name}`);
  const next = ProfileMetaSchema.parse({ ...old, ...update, name: old.name, updatedAt: nowIso() });
  await writeYamlFile(path.join(profileDir(name), "meta.yaml"), next);
  return next;
}

export async function removeProfile(name: string): Promise<void> {
  const dir = profileDir(name);
  if (!(await pathExists(dir))) throw new CcxError(`Profile not found: ${name}`);
  await fs.remove(dir);
  const state = await readState();
  if (state.activeProfile === name) await updateState({ activeProfile: undefined });
}

export async function activeProfileName(): Promise<string | undefined> {
  return (await readState()).activeProfile;
}
