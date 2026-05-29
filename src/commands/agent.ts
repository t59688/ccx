import { Command } from "commander";
import chalk from "chalk";
import { readCurrentSnapshot } from "../core/agents.js";
import {
  applyAgentProfile,
  buildClaudeProfile,
  buildCodexProfile,
  listAgentProfiles,
  loadAgentProfile,
  loadAgentProfileMeta,
  printAgentDiff,
  removeAgentProfile,
  saveAgentProfile,
  saveCurrentAgentProfile
} from "../core/agent-profiles.js";
import { redactedJson } from "../core/redact.js";
import { readState } from "../core/state.js";
import { Agent, ClaudeProfile, CodexProfile } from "../types/schema.js";
import { CcxError } from "../utils/errors.js";
import { formatAgent, t } from "../utils/i18n.js";
import { promptConfirm, promptSecret, promptSelect, promptText } from "../utils/prompts.js";

interface CommonOptions {
  displayName?: string;
  description?: string;
  force?: boolean;
}

interface ClaudeCreateOptions extends CommonOptions {
  baseUrl?: string;
  apiUrl?: string;
  authToken?: string;
  key?: string;
  model?: string;
  reasoningModel?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
}

interface CodexCreateOptions extends CommonOptions {
  baseUrl?: string;
  apiUrl?: string;
  key?: string;
  model?: string;
  modelReasoningEffort?: string;
  reasoningEffort?: string;
}

function activeNameFromState(agent: Agent, state: Awaited<ReturnType<typeof readState>>): string | undefined {
  return agent === "claude" ? state.activeClaudeProfile : state.activeCodexProfile;
}

function hasAnyValue(input: Record<string, unknown>): boolean {
  return Object.values(input).some((value) => value !== undefined && value !== false);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function promptPresetName(agent: Agent, name?: string): Promise<string> {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const entered = await promptText(agent === "claude" ? t("agentNameClaude") : t("agentNameCodex"));
  const next = entered.trim();
  if (!next) throw new CcxError(t("invalidProfileName", { name: "" }), t("invalidProfileNameHint"));
  return next;
}

async function resolveShowPresetName(agent: Agent, name?: string): Promise<string> {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const active = activeNameFromState(agent, await readState());
  if (active) return active;
  const profiles = await listAgentProfiles(agent);
  if (profiles.length === 0) throw new CcxError(t("agentNoConfigs", { agent }));
  if (profiles.length === 1) return profiles[0].name;
  return await promptSelect(
    t("agentShowSelect", { agent: formatAgent(agent) }),
    profiles.map((p) => ({
      name: `${p.name}${p.displayName ? ` (${p.displayName})` : ""}`,
      value: p.name
    }))
  );
}

function currentClaudeDefaults(profile?: ClaudeProfile): Record<string, unknown> {
  const env = profile?.settings?.env && typeof profile.settings.env === "object" ? profile.settings.env as Record<string, unknown> : {};
  return {
    baseUrl: env.ANTHROPIC_BASE_URL,
    authToken: env.ANTHROPIC_AUTH_TOKEN,
    model: env.ANTHROPIC_MODEL,
    reasoningModel: env.ANTHROPIC_REASONING_MODEL,
    haikuModel: env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    sonnetModel: env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    opusModel: env.ANTHROPIC_DEFAULT_OPUS_MODEL
  };
}

function currentCodexDefaults(profile?: CodexProfile): Record<string, unknown> {
  const config = profile?.config ?? {};
  const providers = config.model_providers && typeof config.model_providers === "object" ? config.model_providers as Record<string, Record<string, unknown>> : {};
  const providerConfig = providers.custom ?? {};
  return {
    baseUrl: providerConfig.base_url,
    key: profile?.auth?.OPENAI_API_KEY,
    model: config.model,
    modelReasoningEffort: config.model_reasoning_effort
  };
}

async function collectClaude(options: ClaudeCreateOptions, defaults?: Record<string, unknown>, forceInteractive = false): Promise<ClaudeProfile> {
  const interactive = forceInteractive || !hasAnyValue(options as Record<string, unknown>);
  const baseUrl = options.baseUrl ?? options.apiUrl ?? (interactive ? await promptText(t("claudeBaseUrl"), str(defaults?.baseUrl)) : undefined);
  const authToken = options.authToken ?? options.key ?? (interactive ? await promptSecret(t("claudeKey")) || str(defaults?.authToken) : undefined);
  const model = options.model ?? (interactive ? await promptText(t("claudeModel"), str(defaults?.model)) : undefined);
  const reasoningModel = options.reasoningModel ?? (interactive ? await promptText(t("claudeReasoningModel"), str(defaults?.reasoningModel)) : undefined);
  const haikuModel = options.haikuModel ?? (interactive ? await promptText(t("claudeHaikuModel"), str(defaults?.haikuModel)) : undefined);
  const sonnetModel = options.sonnetModel ?? (interactive ? await promptText(t("claudeSonnetModel"), str(defaults?.sonnetModel)) : undefined);
  const opusModel = options.opusModel ?? (interactive ? await promptText(t("claudeOpusModel"), str(defaults?.opusModel)) : undefined);

  return buildClaudeProfile({ baseUrl, authToken, model, reasoningModel, haikuModel, sonnetModel, opusModel });
}

async function collectCodex(options: CodexCreateOptions, defaults?: Record<string, unknown>, forceInteractive = false): Promise<CodexProfile> {
  const interactive = forceInteractive || !hasAnyValue(options as Record<string, unknown>);
  const baseUrl = options.baseUrl ?? options.apiUrl ?? (interactive ? await promptText(t("codexBaseUrl"), str(defaults?.baseUrl)) : undefined);
  const key = options.key ?? (interactive ? await promptSecret(t("codexKey")) || str(defaults?.key) : undefined);
  const model = options.model ?? (interactive ? await promptText(t("codexModel"), str(defaults?.model)) : undefined);
  const modelReasoningEffort = options.modelReasoningEffort ?? options.reasoningEffort
    ?? (interactive ? await promptText(t("codexReasoningEffort"), str(defaults?.modelReasoningEffort)) : undefined);
  return buildCodexProfile({ baseUrl, key, model, modelReasoningEffort });
}

function printAgentRow(agent: Agent, name: string, displayName: string | undefined, updatedAt: string, active?: string): void {
  const marker = name === active ? chalk.green("*") : " ";
  console.log(`${marker} ${chalk.bold(name)}${displayName ? ` (${displayName})` : ""}  ${chalk.gray(formatAgent(agent))}  ${updatedAt}`);
}

function addCommonCreateOptions(command: Command): Command {
  return command
    .option("--display-name <name>", t("commonDisplayName"))
    .option("--description <text>", t("commonDescription"))
    .option("-f, --force", t("commonForce"));
}

function claudeCommand(): Command {
  const command = new Command("claude").description(t("agentClaudeDescription"));

  command.addCommand(
    addCommonCreateOptions(new Command("create").alias("new").argument("[name]", t("agentNameClaude")))
      .description(t("agentCreateClaudeDescription"))
      .option("--base-url <url>", t("claudeBaseUrl"))
      .option("--api-url <url>", t("claudeBaseUrl"))
      .option("--key <token>", t("claudeKey"))
      .option("--auth-token <token>", t("claudeKey"))
      .option("--model <model>", "ANTHROPIC_MODEL")
      .option("--reasoning-model <model>", "ANTHROPIC_REASONING_MODEL")
      .option("--haiku-model <model>", "ANTHROPIC_DEFAULT_HAIKU_MODEL")
      .option("--sonnet-model <model>", "ANTHROPIC_DEFAULT_SONNET_MODEL")
      .option("--opus-model <model>", "ANTHROPIC_DEFAULT_OPUS_MODEL")
      .action(async (name: string | undefined, options: ClaudeCreateOptions) => {
        const presetName = await promptPresetName("claude", name);
        const profile = await collectClaude(options);
        const meta = await saveAgentProfile("claude", presetName, profile, options);
        console.log(chalk.green(t("agentCreated", { agent: formatAgent("claude"), name: meta.name })));
      })
  );

  command.addCommand(saveAgentCommand("claude"));
  command.addCommand(useAgentCommand("claude"));
  command.addCommand(listAgentCommand("claude"));
  command.addCommand(showAgentCommand("claude"));
  command.addCommand(diffAgentCommand("claude"));
  command.addCommand(removeAgentCommand("claude"));
  command.addCommand(editClaudeCommand());
  command.addCommand(browseAgentCommand("claude"), { isDefault: true });
  return command;
}

function codexCommand(): Command {
  const command = new Command("codex").description(t("agentCodexDescription"));

  command.addCommand(
    addCommonCreateOptions(new Command("create").alias("new").argument("[name]", t("agentNameCodex")))
      .description(t("agentCreateCodexDescription"))
      .option("--base-url <url>", t("codexBaseUrl"))
      .option("--api-url <url>", t("codexBaseUrl"))
      .option("--key <key>", t("codexKey"))
      .option("--model <model>", t("codexModel"))
      .option("--reasoning-effort <level>", t("codexReasoningEffort"))
      .action(async (name: string | undefined, options: CodexCreateOptions) => {
        const presetName = await promptPresetName("codex", name);
        const profile = await collectCodex(options);
        const meta = await saveAgentProfile("codex", presetName, profile, options);
        console.log(chalk.green(t("agentCreated", { agent: formatAgent("codex"), name: meta.name })));
      })
  );

  command.addCommand(saveAgentCommand("codex"));
  command.addCommand(useAgentCommand("codex"));
  command.addCommand(listAgentCommand("codex"));
  command.addCommand(showAgentCommand("codex"));
  command.addCommand(diffAgentCommand("codex"));
  command.addCommand(removeAgentCommand("codex"));
  command.addCommand(editCodexCommand());
  command.addCommand(browseAgentCommand("codex"), { isDefault: true });
  return command;
}

function saveAgentCommand(agent: Agent): Command {
  return addCommonCreateOptions(new Command("save").argument("<name>", t(agent === "claude" ? "agentNameClaude" : "agentNameCodex")))
    .description(t("agentSaveDescription", { agent: formatAgent(agent) }))
    .action(async (name: string, options: CommonOptions) => {
      const meta = await saveCurrentAgentProfile(agent, name, options);
      console.log(chalk.green(t("agentCreated", { agent: formatAgent(agent), name: meta.name })));
    });
}

function useAgentCommand(agent: Agent): Command {
  return new Command("use")
    .argument("<name>", t(agent === "claude" ? "agentNameClaude" : "agentNameCodex"))
    .description(t("agentUseDescription", { agent: formatAgent(agent) }))
    .option("--no-backup", t("commonNoBackup"))
    .option("--dry-run", t("commonDryRun"))
    .action(async (name: string, options: { backup?: boolean; dryRun?: boolean }) => {
      const profile = await loadAgentProfile(agent as never, name);
      if (options.dryRun) {
        console.log(redactedJson(profile));
        return;
      }
      await applyAgentProfile(agent, name, { backup: options.backup });
      console.log(chalk.green(t("agentSwitched", { agent: formatAgent(agent), name })));
      console.log(chalk.gray(t("otherAgentsUnchanged")));
      console.log(chalk.gray(t("restartAgent", { agent: formatAgent(agent) })));
    });
}

function listAgentCommand(agent: Agent): Command {
  return new Command("list")
    .alias("ls")
    .description(t("agentListDescription", { agent: formatAgent(agent) }))
    .action(async () => {
      const profiles = await listAgentProfiles(agent);
      const state = await readState();
      const active = activeNameFromState(agent, state);
      if (profiles.length === 0) {
        console.log(chalk.yellow(t("agentNoConfigs", { agent })));
        return;
      }
      for (const meta of profiles) printAgentRow(agent, meta.name, meta.displayName, meta.updatedAt, active);
    });
}

function showAgentCommand(agent: Agent): Command {
  return new Command("show")
    .argument("[name]", t(agent === "claude" ? "agentNameClaude" : "agentNameCodex"))
    .description(t("agentShowDescription", { agent: formatAgent(agent) }))
    .action(async (name?: string) => {
      const selected = await resolveShowPresetName(agent, name);
      const meta = await loadAgentProfileMeta(agent, selected);
      const profile = await loadAgentProfile(agent as never, selected);
      console.log(chalk.bold(t("agentConfigurationHeader", { agent: formatAgent(agent), name: selected })));
      if (meta) console.log(redactedJson(meta));
      console.log(redactedJson(profile));
    });
}

function diffAgentCommand(agent: Agent): Command {
  return new Command("diff")
    .argument("<name>", t(agent === "claude" ? "agentNameClaude" : "agentNameCodex"))
    .description(t("agentDiffDescription", { agent: formatAgent(agent) }))
    .action(async (name: string) => {
      await printAgentDiff(agent, name);
    });
}

function removeAgentCommand(agent: Agent): Command {
  return new Command("remove")
    .alias("rm")
    .argument("<name>", t(agent === "claude" ? "agentNameClaude" : "agentNameCodex"))
    .description(t("agentRemoveDescription", { agent: formatAgent(agent) }))
    .option("-y, --yes", t("commonYes"))
    .action(async (name: string, options: { yes?: boolean }) => {
      if (!options.yes) {
        const ok = await promptConfirm(t("agentDeleteConfirm", { agent: formatAgent(agent), name }), false);
        if (!ok) return;
      }
      await removeAgentProfile(agent, name);
      console.log(chalk.green(t("agentRemoved", { agent: formatAgent(agent), name })));
    });
}

function editClaudeCommand(): Command {
  return addCommonCreateOptions(new Command("edit").argument("<name>", t("agentNameClaude")))
    .description(t("agentEditClaudeDescription"))
    .action(async (name: string, options: CommonOptions) => {
      const existing = await loadAgentProfile("claude", name);
      const profile = await collectClaude(options as ClaudeCreateOptions, currentClaudeDefaults(existing), true);
      const oldMeta = await loadAgentProfileMeta("claude", name);
      await saveAgentProfile("claude", name, profile, { force: true, displayName: options.displayName ?? oldMeta?.displayName, description: options.description ?? oldMeta?.description });
      console.log(chalk.green(t("agentUpdated", { agent: formatAgent("claude"), name })));
    });
}

function editCodexCommand(): Command {
  return addCommonCreateOptions(new Command("edit").argument("<name>", t("agentNameCodex")))
    .description(t("agentEditCodexDescription"))
    .action(async (name: string, options: CommonOptions) => {
      const existing = await loadAgentProfile("codex", name);
      const profile = await collectCodex(options as CodexCreateOptions, currentCodexDefaults(existing), true);
      const oldMeta = await loadAgentProfileMeta("codex", name);
      await saveAgentProfile("codex", name, profile, { force: true, displayName: options.displayName ?? oldMeta?.displayName, description: options.description ?? oldMeta?.description });
      console.log(chalk.green(t("agentUpdated", { agent: formatAgent("codex"), name })));
    });
}

function browseAgentCommand(agent: Agent): Command {
  return new Command("browse")
    .description(t("agentBrowseDescription", { agent: formatAgent(agent) }))
    .action(async () => {
      while (true) {
        const profiles = await listAgentProfiles(agent);
        if (profiles.length === 0) {
          console.log(chalk.yellow(t("agentNoConfigs", { agent })));
          return;
        }
        const selected = await promptSelect(t("agentConfigurations", { agent: formatAgent(agent) }), [
          ...profiles.map((p) => ({ name: `${p.name}${p.displayName ? ` (${p.displayName})` : ""}`, value: p.name })),
          { name: t("browseQuit"), value: "::quit" }
        ]);
        if (selected === "::quit") return;
        const action = await promptSelect(`${formatAgent(agent)}/${selected}`, [
          { name: t("browseUse"), value: "use" },
          { name: t("browseShow"), value: "show" },
          { name: t("browseEdit"), value: "edit" },
          { name: t("browseDiff"), value: "diff" },
          { name: t("browseDelete"), value: "delete" },
          { name: t("browseBack"), value: "back" }
        ] as const);
        if (action === "back") continue;
        if (action === "show") console.log(redactedJson(await loadAgentProfile(agent as never, selected)));
        else if (action === "diff") await printAgentDiff(agent, selected);
        else if (action === "use") {
          await applyAgentProfile(agent, selected);
          console.log(chalk.green(t("agentSwitched", { agent: formatAgent(agent), name: selected })));
          console.log(chalk.gray(t("otherAgentsUnchanged")));
        } else if (action === "edit") {
          const existing = await loadAgentProfile(agent as never, selected);
          const profile = agent === "claude"
            ? await collectClaude({}, currentClaudeDefaults(existing as ClaudeProfile), true)
            : await collectCodex({}, currentCodexDefaults(existing as CodexProfile), true);
          const meta = await loadAgentProfileMeta(agent, selected);
          await saveAgentProfile(agent as never, selected, profile as never, { force: true, displayName: meta?.displayName, description: meta?.description });
        } else if (action === "delete") {
          const ok = await promptConfirm(t("agentDeleteConfirm", { agent: formatAgent(agent), name: selected }), false);
          if (ok) await removeAgentProfile(agent, selected);
        }
      }
    });
}

export function agentCommands(): Command[] {
  return [claudeCommand(), codexCommand()];
}

export async function printAllAgentProfiles(): Promise<void> {
  const state = await readState();
  for (const agent of ["claude", "codex"] as const) {
    const profiles = await listAgentProfiles(agent);
    console.log(chalk.bold(agent === "claude" ? t("listClaudeHeader") : t("listCodexHeader")));
    if (profiles.length === 0) {
      console.log(chalk.gray(`  ${t("listNone")}`));
      continue;
    }
    const active = activeNameFromState(agent, state);
    for (const meta of profiles) printAgentRow(agent, meta.name, meta.displayName, meta.updatedAt, active);
  }
}

export async function saveCurrentBothIfRequested(): Promise<void> {
  const snapshot = await readCurrentSnapshot();
  if (!snapshot.claude && !snapshot.codex) throw new CcxError(t("noAnyConfig"));
}
