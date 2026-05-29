import { confirm, input, password, select, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import { t } from "./i18n.js";

export async function promptText(message: string, defaultValue?: string): Promise<string> {
  if (defaultValue !== undefined && defaultValue !== "") {
    console.log(chalk.gray(`  ${t("promptCurrent")}: ${defaultValue}`));
  }
  return input({ message, default: defaultValue });
}

export async function promptSecret(message: string, keepExisting = false): Promise<string> {
  const hint = keepExisting ? chalk.gray(` (${t("promptKeepSecret")})`) : "";
  return password({ message: `${message}${hint}`, mask: "*" });
}

export async function promptConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export async function promptSelect<T extends string>(message: string, choices: { name: string; value: T }[]): Promise<T> {
  return select({ message, choices });
}

export async function promptCheckbox<T extends string>(message: string, choices: { name: string; value: T; checked?: boolean }[]): Promise<T[]> {
  return checkbox({ message, choices });
}
