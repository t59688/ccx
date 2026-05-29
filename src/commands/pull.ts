import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { CCX_DIR, DEFAULT_GITHUB_PATH } from "../core/paths.js";
import { decryptBuffer, passphraseHash, unpackDirectory } from "../core/crypto.js";
import { downloadEncryptedProfiles } from "../core/github.js";
import { readState, updateState } from "../core/state.js";
import { resolveGitHubAuth } from "../core/github-auth.js";
import { promptConfirm, promptSecret } from "../utils/prompts.js";
import { t } from "../utils/i18n.js";

export function pullCommand(): Command {
  return new Command("pull")
    .description(t("pullDescription"))
    .option("--repo <owner/name>", t("commonRepo"))
    .option("--token <token>", t("commonToken"))
    .option("--branch <branch>", t("commonBranch"))
    .option("--path <path>", t("commonPath"))
    .option("--save-token", t("commonSaveToken"))
    .option("--no-open-browser", t("commonNoOpenBrowser"))
    .option("--overwrite", t("commonOverwrite"))
    .action(async (options: { repo?: string; token?: string; branch?: string; path?: string; saveToken?: boolean; openBrowser?: boolean; overwrite?: boolean }) => {
      const state = await readState();
      const target = await resolveGitHubAuth(options, DEFAULT_GITHUB_PATH, "pull");
      const passphrase = await promptSecret(t("encryptionPassphrase"));
      if (state.encryptionKeyHash && state.encryptionKeyHash !== passphraseHash(passphrase)) {
        const ok = await promptConfirm(t("pullPassphraseMismatch"), false);
        if (!ok) return;
      }
      const spinner = ora(t("pullDownloading")).start();
      try {
        const encrypted = await downloadEncryptedProfiles(target);
        spinner.text = t("pullDecrypting");
        const archive = decryptBuffer(encrypted, passphrase);
        spinner.text = t("pullUnpacking");
        const written = await unpackDirectory(archive, CCX_DIR, Boolean(options.overwrite));
        await updateState({
          githubRepo: target.repo,
          githubBranch: target.branch,
          githubPath: target.filePath,
          encryptionKeyHash: passphraseHash(passphrase)
        });
        spinner.succeed(t("pullDone", { count: written }));
        console.log(chalk.gray(options.overwrite ? t("pullOverwriteEnabled") : t("pullExistingPreserved")));
      } catch (error) {
        spinner.stop();
        throw error;
      }
    });
}
