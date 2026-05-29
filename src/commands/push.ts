import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CCX_DIR, DEFAULT_GITHUB_PATH } from "../core/paths.js";
import { encryptBuffer, packNamedPaths, passphraseHash } from "../core/crypto.js";
import { createRepository, getRepository, uploadEncryptedProfiles } from "../core/github.js";
import { listAgentProfiles, saveCurrentAgentProfile } from "../core/agent-profiles.js";
import { readState, updateState } from "../core/state.js";
import { resolveGitHubAuth } from "../core/github-auth.js";
import { promptConfirm, promptSecret } from "../utils/prompts.js";
import { CcxError } from "../utils/errors.js";
import { t } from "../utils/i18n.js";

function optionalName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export function pushCommand(): Command {
  return new Command("push")
    .description(t("pushDescription"))
    .option("--repo <owner/name>", t("commonRepo"))
    .option("--token <token>", t("commonToken"))
    .option("--branch <branch>", t("commonBranch"))
    .option("--path <path>", t("commonPath"))
    .option("--save-current-claude [name]", t("pushSaveClaude"))
    .option("--save-current-codex [name]", t("pushSaveCodex"))
    .option("--create-repo", t("pushCreateRepo"))
    .option("--public-repo", t("pushPublicRepo"))
    .option("--save-token", t("commonSaveToken"))
    .option("--no-open-browser", t("commonNoOpenBrowser"))
    .option("--yes", t("commonYes"))
    .action(async (options: { repo?: string; token?: string; branch?: string; path?: string; saveCurrentClaude?: boolean | string; saveCurrentCodex?: boolean | string; createRepo?: boolean; publicRepo?: boolean; saveToken?: boolean; openBrowser?: boolean; yes?: boolean }) => {
      const state = await readState();
      if (options.saveCurrentClaude) {
        const name = optionalName(options.saveCurrentClaude) ?? state.activeClaudeProfile;
        if (!name) throw new CcxError(t("saveCurrentClaudeNameMissing"));
        await saveCurrentAgentProfile("claude", name, { force: true });
        console.log(chalk.gray(t("pushSavedCurrentClaude", { name })));
      }
      if (options.saveCurrentCodex) {
        const name = optionalName(options.saveCurrentCodex) ?? state.activeCodexProfile;
        if (!name) throw new CcxError(t("saveCurrentCodexNameMissing"));
        await saveCurrentAgentProfile("codex", name, { force: true });
        console.log(chalk.gray(t("pushSavedCurrentCodex", { name })));
      }

      const claudeProfiles = await listAgentProfiles("claude");
      const codexProfiles = await listAgentProfiles("codex");
      const count = claudeProfiles.length + codexProfiles.length;
      if (count === 0) throw new CcxError(t("pushNoProfiles"), t("pushNoProfilesHint"));

      console.log(chalk.bold(t("pushProfilesToSync", { count })));
      for (const profile of claudeProfiles) console.log(`  - claude/${profile.name}`);
      for (const profile of codexProfiles) console.log(`  - codex/${profile.name}`);
      if (!options.yes) {
        const ok = await promptConfirm(t("pushConfirm"), true);
        if (!ok) return;
      }

      const target = await resolveGitHubAuth(options, DEFAULT_GITHUB_PATH, "push");
      const privateRepo = !options.publicRepo;
      let repository = await getRepository(target);
      if (!repository) {
        const shouldCreate = Boolean(options.createRepo || options.yes) || await promptConfirm(
          t("pushRepoMissingConfirm", { repo: target.repo, visibility: privateRepo ? t("visibilityAPrivate") : t("visibilityAPublic") }),
          true
        );
        if (!shouldCreate) {
          throw new CcxError(t("pushRepoMissing", { repo: target.repo }), t("pushRepoMissingHint"));
        }
        repository = await createRepository(target, privateRepo);
      }
      console.log(chalk.gray(t("pushRepoLine", { repo: repository.full_name, visibility: repository.private ? t("visibilityPrivate") : t("visibilityPublic") })));

      const passphrase = await promptSecret(t("encryptionPassphrase"));
      const spinner = ora(t("pushPacking")).start();
      try {
        const archive = await packNamedPaths(CCX_DIR, ["agents"]);
        spinner.text = t("pushEncrypting");
        const encrypted = encryptBuffer(archive, passphrase);
        spinner.text = t("pushUploading");
        await uploadEncryptedProfiles(target, encrypted);
        await updateState({
          githubRepo: target.repo,
          githubBranch: target.branch,
          githubPath: target.filePath,
          encryptionKeyHash: passphraseHash(passphrase)
        });
        spinner.succeed(t("pushDone", { count }));
        console.log(chalk.gray(`${target.repo}:${target.filePath}`));
      } catch (error) {
        spinner.stop();
        throw error;
      }
    });
}
