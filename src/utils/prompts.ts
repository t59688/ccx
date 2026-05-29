import { confirm, input, password, select } from "@inquirer/prompts";

export async function promptText(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}

export async function promptSecret(message: string): Promise<string> {
  return password({ message, mask: "*" });
}

export async function promptConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export async function promptSelect<T extends string>(message: string, choices: { name: string; value: T }[]): Promise<T> {
  return select({ message, choices });
}
