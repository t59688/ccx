import { Command } from "commander";
import chalk from "chalk";
import { readCurrentSnapshot } from "../core/agents.js";
import {
  applyAgentProfile,
  buildClaudeProfile,
  buildCodexProfile,
  extractClaudeProfileInput,
  extractCodexProfileInput,
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

function keepIfBlank(prompted: string, existing?: string): string | undefined {
  const trimmed = prompted.trim();
  if (trimmed) return trimmed;
  return existing;
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

async function collectClaude(options: ClaudeCreateOptions, defaults?: ReturnType<typeof extractClaudeProfileInput>, forceInteractive = false): Promise<ClaudeProfile> {
  const interactive = forceInteractive || !hasAnyValue(options as Record<string, unknown>);
  const baseUrl = options.baseUrl ?? options.apiUrl
    ?? (interactive ? keepIfBlank(await promptText(t("claudeBaseUrl"), defaults?.baseUrl), defaults?.baseUrl) : undefined);
  const authToken = options.authToken ?? options.key
    ?? (interactive ? keepIfBlank(await promptSecret(t("claudeKey"), Boolean(defaults?.authToken)), defaults?.authToken) : undefined);
  const model = options.model
    ?? (interactive ? keepIfBlank(await promptText(t("claudeModel"), defaults?.model), defaults?.model) : undefined);
  const reasoningModel = options.reasoningModel
    ?? (interactive ? keepIfBlank(await promptText(t("claudeReasoningModel"), defaults?.reasoningModel), defaults?.reasoningModel) : undefined);
  const haikuModel = options.haikuModel
    ?? (interactive ? keepIfBlank(await promptText(t("claudeHaikuModel"), defaults?.haikuModel), defaults?.haikuModel) : undefined);
  const sonnetModel = options.sonnetModel
    ?? (interactive ? keepIfBlank(await promptText(t("claudeSonnetModel"), defaults?.sonnetModel), defaults?.sonnetModel) : undefined);
  const opusModel = options.opusModel
    ?? (interactive ? keepIfBlank(await promptText(t("claudeOpusModel"), defaults?.opusModel), defaults?.opusModel) : undefined);

  return buildClaudeProfile({ baseUrl, authToken, model, reasoningModel, haikuModel, sonnetModel, opusModel });
}

async function collectCodex(options: CodexCreateOptions, defaults?: ReturnType<typeof extractCodexProfileInput>, forceInteractive = false): Promise<CodexProfile> {
  const interactive = forceInteractive || !hasAnyValue(options as Record<string, unknown>);
  const baseUrl = options.baseUrl ?? options.apiUrl
    ?? (interactive ? keepIfBlank(await promptText(t("codexBaseUrl"), defaults?.baseUrl), defaults?.baseUrl) : undefined);
  const key = options.key
    ?? (interactive ? keepIfBlank(await promptSecret(t("codexKey"), Boolean(defaults?.key)), defaults?.key) : undefined);
  const model = options.model
    ?? (interactive ? keepIfBlank(await promptText(t("codexModel"), defaults?.model), defaults?.model) : undefined);
  const modelReasoningEffort = options.modelReasoningEffort ?? options.reasoningEffort
    ?? (interactive ? keepIfBlank(await promptText(t("codexReasoningEffort"), defaults?.modelReasoningEffort), defaults?.modelReasoningEffort) : undefined);
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
  return addCommonCreateOptions(new Command("save").argument("[name]", t(agent === "claude" ? "agentNameClaude" : "agentNameCodex")))
    .description(t("agentSaveDescription", { agent: formatAgent(agent) }))
    .action(async (name: string | undefined, options: CommonOptions) => {
      const presetName = await promptPresetName(agent, name);
      const meta = await saveCurrentAgentProfile(agent, presetName, options);
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
      const profile = await collectClaude(options as ClaudeCreateOptions, extractClaudeProfileInput(existing), true);
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
      const profile = await collectCodex(options as CodexCreateOptions, extractCodexProfileInput(existing), true);
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
            ? await collectClaude({}, extractClaudeProfileInput(existing as ClaudeProfile), true)
            : await collectCodex({}, extractCodexProfileInput(existing as CodexProfile), true);
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
