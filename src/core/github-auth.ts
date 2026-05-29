import { spawn } from "node:child_process";
import process from "node:process";
import chalk from "chalk";
import { readState, updateState } from "./state.js";
import { State } from "../types/schema.js";
import { generateUniqueCcxRepoName, getAuthenticatedLogin, listCcxRepos } from "./github.js";
import { promptConfirm, promptSecret, promptSelect, promptText } from "../utils/prompts.js";
import { CcxError } from "../utils/errors.js";
import { t } from "../utils/i18n.js";

export type GitHubAuthMode = "push" | "pull";

export interface GitHubAuthOptions {
  repo?: string;
  token?: string;
  branch?: string;
  path?: string;
  saveToken?: boolean;
  openBrowser?: boolean;
}

export interface ResolvedGitHubAuth {
  repo: string;
  token: string;
  branch?: string;
  filePath: string;
  tokenSource: "option" | "env" | "state" | "prompt";
}

export const GITHUB_TOKEN_URL = "https://github.com/settings/tokens/new?description=ccx%20encrypted%20sync&scopes=repo";

function spawnDetached(command: string, args: string[]): boolean {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    // spawn() does not throw ENOENT; failures arrive on the "error" event.
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function openWithSystemBrowser(url: string): boolean {
  const platform = process.platform;
  const attempts: Array<{ command: string; args: string[] }> = [];

  if (platform === "darwin") {
    attempts.push({ command: "open", args: [url] });
  } else if (platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const escapedUrl = url.replace(/'/g, "''");
    attempts.push({
      command: `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      args: ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${escapedUrl}'`]
    });
    const comSpec = process.env.ComSpec ?? `${systemRoot}\\System32\\cmd.exe`;
    attempts.push({ command: comSpec, args: ["/c", "start", "", url] });
  } else {
    attempts.push({ command: "xdg-open", args: [url] });
  }

  for (const attempt of attempts) {
    if (spawnDetached(attempt.command, attempt.args)) return true;
  }
  return false;
}

async function resolveToken(
  options: GitHubAuthOptions,
  state: State
): Promise<{ token: string; tokenSource: ResolvedGitHubAuth["tokenSource"] }> {
  let token = options.token;
  let tokenSource: ResolvedGitHubAuth["tokenSource"] = "option";
  if (!token && process.env.GITHUB_TOKEN) {
    token = process.env.GITHUB_TOKEN;
    tokenSource = "env";
  }
  if (!token && process.env.GH_TOKEN) {
    token = process.env.GH_TOKEN;
    tokenSource = "env";
  }
  if (!token && state.githubToken) {
    token = state.githubToken;
    tokenSource = "state";
  }
  if (!token) {
    tokenSource = "prompt";
    console.log(chalk.yellow("No GitHub token found."));
    console.log("Create a token with repo permission, then paste it here.");
    console.log(chalk.gray(GITHUB_TOKEN_URL));
    if (options.openBrowser !== false) {
      const opened = openWithSystemBrowser(GITHUB_TOKEN_URL);
      if (!opened) console.log(chalk.gray("Could not open the browser automatically. Copy the URL above manually."));
    }
    token = await promptSecret("GitHub token");
  }
  if (!token) throw new CcxError("GitHub token is required.");

  if ((options.saveToken || tokenSource === "prompt") && tokenSource !== "state") {
    const shouldSave = options.saveToken || await promptConfirm(t("saveTokenConfirm"), false);
    if (shouldSave) await updateState({ githubToken: token });
  }
  return { token, tokenSource };
}

function withOwner(value: string, login: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new CcxError(t("repoNeeded"), t("repoNeededHint"));
  return trimmed.includes("/") ? trimmed : `${login}/${trimmed}`;
}

async function resolveRepo(options: GitHubAuthOptions, state: State, token: string, mode: GitHubAuthMode): Promise<string> {
  if (options.repo) return options.repo;
  if (state.githubRepo) return state.githubRepo;
  if (!process.stdin.isTTY) throw new CcxError(t("repoNeeded"), t("repoNeededHint"));

  const login = await getAuthenticatedLogin(token);

  if (mode === "pull") {
    const repos = await listCcxRepos(token);
    if (repos.length > 0) {
      const choices = repos.map((repo) => ({
        name: `${repo.full_name}${repo.private ? ` (${t("visibilityPrivate")})` : ""}`,
        value: repo.full_name
      }));
      choices.push({ name: t("repoEnterManually"), value: "::manual" });
      const selected = await promptSelect(t("repoSelectPull"), choices);
      if (selected !== "::manual") return selected;
    } else {
      console.log(chalk.gray(t("repoNoneFound")));
    }
    return withOwner(await promptText(t("repoNamePrompt")), login);
  }

  const choice = await promptSelect(t("repoSetupChoice"), [
    { name: t("repoAutoGenerate"), value: "auto" },
    { name: t("repoEnterOwn"), value: "own" }
  ] as const);
  if (choice === "auto") {
    const full = `${login}/${await generateUniqueCcxRepoName(token)}`;
    console.log(chalk.gray(t("repoGenerated", { repo: full })));
    return full;
  }
  return withOwner(await promptText(t("repoNamePrompt")), login);
}

export async function resolveGitHubAuth(
  options: GitHubAuthOptions,
  defaultPath: string,
  mode: GitHubAuthMode = "push"
): Promise<ResolvedGitHubAuth> {
  const state = await readState();
  const { token, tokenSource } = await resolveToken(options, state);
  const repo = await resolveRepo(options, state, token, mode);

  return {
    repo,
    token,
    branch: options.branch ?? state.githubBranch,
    filePath: options.path ?? state.githubPath ?? defaultPath,
    tokenSource
  };
}
