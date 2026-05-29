const SECRET_KEY_PATTERN = /(token|key|secret|password|credential|auth)/i;

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") return redactObject(value as Record<string, unknown>);
  return value;
}

export function redactString(value: string): string {
  if (!value) return value;
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

export function redactObject<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(key)) out[key] = redactValue(value);
    else if (value && typeof value === "object" && !Array.isArray(value)) out[key] = redactObject(value as Record<string, unknown>);
    else out[key] = value;
  }
  return out as T;
}

export function redactedJson(value: unknown): string {
  if (value && typeof value === "object") {
    return JSON.stringify(redactObject(value as Record<string, unknown>), null, 2);
  }
  return JSON.stringify(value, null, 2);
}
