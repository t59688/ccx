export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge<T extends Record<string, unknown>>(base: T, overlay: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

const CODEX_MANAGED_TOP_LEVEL_KEYS = new Set([
  "model",
  "model_provider",
  "model_reasoning_effort",
  "model_reasoning_summary",
  "model_verbosity",
  "disable_response_storage",
  "approval_policy",
  "sandbox_mode"
]);

export function extractCodexProfileConfig(full: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(full)) {
    if (CODEX_MANAGED_TOP_LEVEL_KEYS.has(key)) out[key] = value;
  }
  if (isPlainObject(full.model_providers)) out.model_providers = full.model_providers;
  if (isPlainObject(full.model_provider)) out.model_provider = full.model_provider;
  return out;
}

function isManagedClaudeEnvKey(key: string): boolean {
  if (key.startsWith("ANTHROPIC_")) return true;
  if (key === "CLAUDE_CODE_USE_BEDROCK") return true;
  if (key === "CLAUDE_CODE_USE_VERTEX") return true;
  return false;
}

export function mergeClaudeSettings(existing: Record<string, unknown>, profile: Record<string, unknown>): Record<string, unknown> {
  const existingEnv = isPlainObject(existing.env) ? existing.env : {};
  const profileEnv = isPlainObject(profile.env) ? profile.env : undefined;
  const baseWithoutEnv: Record<string, unknown> = { ...existing };
  delete baseWithoutEnv.env;
  const profileWithoutEnv: Record<string, unknown> = { ...profile };
  delete profileWithoutEnv.env;
  const merged = deepMerge(baseWithoutEnv, profileWithoutEnv);
  if (profileEnv) {
    const nextEnv: Record<string, unknown> = { ...existingEnv };
    for (const key of Object.keys(nextEnv)) {
      if (isManagedClaudeEnvKey(key)) delete nextEnv[key];
    }
    for (const [key, value] of Object.entries(profileEnv)) nextEnv[key] = value;
    merged.env = nextEnv;
  }
  return merged;
}

export function mergeCodexConfig(existing: Record<string, unknown>, profile: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(profile)) {
    if (key === "model_providers" && isPlainObject(value)) {
      const currentProviders = isPlainObject(merged.model_providers) ? merged.model_providers : {};
      merged.model_providers = deepMerge(currentProviders, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function flattenObject(input: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(input)) {
    out[prefix || "<root>"] = input;
    return out;
  }
  for (const [key, value] of Object.entries(input)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) Object.assign(out, flattenObject(value, nextKey));
    else out[nextKey] = value;
  }
  return out;
}
