import { CCX_DIR, STATE_PATH, ensureDataDir } from "./paths.js";
import { State, StateSchema } from "../types/schema.js";
import chalk from "chalk";
import { Language, languageFromState, setLanguage, t } from "../utils/i18n.js";
import { ensurePrivateDir, pathExists, readYamlFile, writeYamlFile } from "../utils/fs.js";
import { promptSelect } from "../utils/prompts.js";

export function defaultState(): State {
  return StateSchema.parse({
    schema: "ccx.state.v1",
    language: "zh-CN"
  });
}

export async function readState(): Promise<State> {
  await ensureDataDir();
  await ensurePrivateDir(CCX_DIR);
  const raw = await readYamlFile<unknown>(STATE_PATH);
  if (!raw) return defaultState();
  return StateSchema.parse(raw);
}

export async function writeState(state: State): Promise<void> {
  await ensureDataDir();
  await ensurePrivateDir(CCX_DIR);
  await writeYamlFile(STATE_PATH, StateSchema.parse(state));
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export async function updateState(update: Partial<State>): Promise<State> {
  const state = await readState();
  const next = StateSchema.parse(stripUndefined({ ...state, ...update }));
  await writeState(next);
  return next;
}

const FIRST_RUN_LANGUAGE_PROMPT = "选择语言 / Select language";

/** Prompt for language when ~/.ccx/state.yaml does not exist yet. */
export async function bootstrapLanguage(): Promise<State> {
  await ensureDataDir();
  if (await pathExists(STATE_PATH)) {
    const state = await readState();
    setLanguage(languageFromState(state));
    return state;
  }

  let language: Language = "zh-CN";
  if (process.stdin.isTTY) {
    language = await promptSelect(FIRST_RUN_LANGUAGE_PROMPT, [
      { name: "简体中文", value: "zh-CN" },
      { name: "English", value: "en" }
    ] as const);
  }

  const state = StateSchema.parse({ schema: "ccx.state.v1", language });
  await writeState(state);
  setLanguage(language);
  if (process.stdin.isTTY) console.log(chalk.gray(t("firstRunLanguageSaved")));
  return state;
}
