import { createHash, randomBytes } from "node:crypto";
import { CcxError } from "../utils/errors.js";

/** Exact GitHub repo description — used to discover ccx sync repos (not the repo name). */
export const CCX_REPO_MARKER = "ccx:preset-sync:v1";

/** Prefix for auto-generated repo names only; discovery does not rely on this. */
export const CCX_REPO_NAME_PREFIX = "ccx-rs-";

const NAME_ID_LENGTH = 12;
const NAME_ID_PATTERN = /^[a-f0-9]{12}$/;

export function isCcxSyncRepo(repo: { description?: string | null }): boolean {
  return repo.description?.trim() === CCX_REPO_MARKER;
}

/** SHA-256(login ‖ random ‖ domain) → 48-bit id as 12 lowercase hex chars. */
export function deriveRepoNameId(login: string): string {
  const digest = createHash("sha256")
    .update("ccx-repo-name-v1", "utf8")
    .update(login, "utf8")
    .update(randomBytes(16))
    .digest();
  return digest.subarray(0, 6).toString("hex");
}

export function formatGeneratedRepoName(login: string): string {
  return `${CCX_REPO_NAME_PREFIX}${deriveRepoNameId(login)}`;
}

export function isGeneratedRepoName(name: string): boolean {
  if (!name.startsWith(CCX_REPO_NAME_PREFIX)) return false;
  return NAME_ID_PATTERN.test(name.slice(CCX_REPO_NAME_PREFIX.length));
}

export function expandRepoNameInput(value: string, login: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("/")) return trimmed;
  if (isGeneratedRepoName(trimmed)) return `${login}/${trimmed}`;
  if (NAME_ID_PATTERN.test(trimmed)) {
    return `${login}/${CCX_REPO_NAME_PREFIX}${trimmed.toLowerCase()}`;
  }
  return `${login}/${trimmed}`;
}

export async function generateUniqueCcxRepoName(
  login: string,
  takenNames: Set<string>
): Promise<string> {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = formatGeneratedRepoName(login);
    if (!takenNames.has(candidate.toLowerCase())) return candidate;
  }
  throw new CcxError("Could not generate a unique repository name.");
}
