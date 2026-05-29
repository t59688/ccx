import chalk from "chalk";
import { FullSnapshot, ProfileMeta } from "../types/schema.js";
import { t } from "./i18n.js";

export function printProfileRow(meta: ProfileMeta, active?: string): void {
  const marker = meta.name === active ? chalk.green("*") : " ";
  const display = meta.displayName ? ` (${meta.displayName})` : "";
  const agents = meta.agents.join(",");
  console.log(`${marker} ${chalk.bold(meta.name)}${display}  [${agents}]  ${meta.updatedAt}`);
}

export function snapshotSummary(snapshot: FullSnapshot): string[] {
  const lines: string[] = [];
  if (snapshot.claude) {
    const env = snapshot.claude.settings?.env as Record<string, unknown> | undefined;
    lines.push(`Claude: ${t("detected")}`);
    if (env?.ANTHROPIC_BASE_URL) lines.push(`  base_url: ${String(env.ANTHROPIC_BASE_URL)}`);
    if (snapshot.claude.settings?.model) lines.push(`  model: ${String(snapshot.claude.settings.model)}`);
    if (env?.ANTHROPIC_MODEL) lines.push(`  env model: ${String(env.ANTHROPIC_MODEL)}`);
  } else {
    lines.push(`Claude: ${t("notDetected")}`);
  }
  if (snapshot.codex) {
    lines.push(`Codex: ${t("detected")}`);
    if (snapshot.codex.config?.model_provider) lines.push(`  provider: ${String(snapshot.codex.config.model_provider)}`);
    if (snapshot.codex.config?.model) lines.push(`  model: ${String(snapshot.codex.config.model)}`);
    const provider = snapshot.codex.config?.model_provider;
    const providers = snapshot.codex.config?.model_providers as Record<string, Record<string, unknown>> | undefined;
    if (typeof provider === "string" && providers?.[provider]?.base_url) {
      lines.push(`  base_url: ${String(providers[provider].base_url)}`);
    }
  } else {
    lines.push(`Codex: ${t("notDetected")}`);
  }
  return lines;
}
