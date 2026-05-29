#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { scanCommand } from "./commands/scan.js";
import { listCommand } from "./commands/list.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { settingCommand } from "./commands/setting.js";
import { migrateCommand } from "./commands/migrate.js";
import { agentCommands } from "./commands/agent.js";
import { bootstrapLanguage } from "./core/state.js";
import { CcxError, getErrorMessage } from "./utils/errors.js";
import { t } from "./utils/i18n.js";
import { promptSelect } from "./utils/prompts.js";

function buildProgram(): Command {
  const program = new Command();
  program
    .name("ccx")
    .description(t("appDescription"))
    .version("0.8.0");

  for (const command of agentCommands()) program.addCommand(command);
  program.addCommand(scanCommand());
  program.addCommand(listCommand());
  program.addCommand(pushCommand());
  program.addCommand(pullCommand());
  program.addCommand(settingCommand());
  program.addCommand(migrateCommand());
  return program;
}

async function interactiveMenu(program: Command): Promise<void> {
  const action = await promptSelect(t("menuTitle"), [
    { name: t("menuClaude"), value: "claude" },
    { name: t("menuCodex"), value: "codex" },
    { name: t("menuMigrate"), value: "migrate-ccs" },
    { name: t("menuScan"), value: "scan" },
    { name: t("menuList"), value: "list" },
    { name: t("menuPush"), value: "push" },
    { name: t("menuPull"), value: "pull" },
    { name: t("menuSettings"), value: "setting" }
  ] as const);
  const args = ["node", "ccx", action];
  if (action === "claude" || action === "codex") args.push("browse");
  await program.parseAsync(args);
}

async function main(): Promise<void> {
  await bootstrapLanguage();
  const program = buildProgram();
  if (process.argv.length <= 2) await interactiveMenu(program);
  else await program.parseAsync(process.argv);
}

main().catch((error) => {
  if (error instanceof CcxError) {
    console.error(chalk.red(error.message));
    if (error.hint) console.error(chalk.gray(error.hint));
  } else {
    console.error(chalk.red(getErrorMessage(error)));
  }
  process.exitCode = 1;
});
