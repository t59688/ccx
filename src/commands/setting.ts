import { Command } from "commander";
import chalk from "chalk";
import { readState, updateState } from "../core/state.js";
import { DEFAULT_GITHUB_PATH } from "../core/paths.js";
import { redactObject } from "../core/redact.js";
import { promptSecret, promptSelect, promptText } from "../utils/prompts.js";
import { setLanguage, t } from "../utils/i18n.js";

export function settingCommand(): Command {
  return new Command("setting")
    .description(t("settingsDescription"))
    .option("--repo <owner/name>", t("settingsRepo"))
    .option("--branch <branch>", t("commonBranch"))
    .option("--path <path>", t("settingsPath"))
    .option("--token <token>", t("commonToken"))
    .option("--clear-token", t("settingsClearToken"))
    .option("--language <language>", t("settingsLanguage"))
    .action(async (options: { repo?: string; branch?: string; path?: string; token?: string; clearToken?: boolean; language?: string }) => {
      if (Object.values(options).some(Boolean)) {
        const update: Record<string, unknown> = {};
        if (options.repo) update.githubRepo = options.repo;
        if (options.branch) update.githubBranch = options.branch;
        if (options.path) update.githubPath = options.path;
        if (options.token) update.githubToken = options.token;
        if (options.clearToken) update.githubToken = undefined;
        if (options.language) update.language = options.language;
        const state = await updateState(update);
        setLanguage(state.language);
        console.log(chalk.green(t("settingsUpdated")));
        console.log(JSON.stringify(redactObject(state as unknown as Record<string, unknown>), null, 2));
        return;
      }

      const state = await readState();
      const action = await promptSelect(t("settingsSelect"), [
        { name: t("settingsSetRepo"), value: "repo" },
        { name: t("settingsSetToken"), value: "token" },
        { name: t("settingsSetPath"), value: "path" },
        { name: t("settingsSetLanguage"), value: "language" },
        { name: t("settingsShow"), value: "show" }
      ] as const);
      if (action === "repo") {
        const repo = await promptText(t("settingsRepoPrompt"), state.githubRepo);
        await updateState({ githubRepo: repo });
      } else if (action === "token") {
        const token = await promptSecret(t("settingsTokenPrompt"));
        await updateState({ githubToken: token });
      } else if (action === "path") {
        const filePath = await promptText(t("settingsPathPrompt"), state.githubPath ?? DEFAULT_GITHUB_PATH);
        await updateState({ githubPath: filePath });
      } else if (action === "language") {
        const language = await promptSelect(t("settingsLanguagePrompt"), [
          { name: t("settingsEnglish"), value: "en" },
          { name: t("settingsChinese"), value: "zh-CN" }
        ] as const);
        await updateState({ language });
        setLanguage(language);
      }
      console.log(JSON.stringify(redactObject((await readState()) as unknown as Record<string, unknown>), null, 2));
    });
}
