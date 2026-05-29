import { Command } from "commander";
import chalk from "chalk";
import { readCurrentSnapshot } from "../core/agents.js";
import { redactedJson } from "../core/redact.js";
import { snapshotSummary } from "../utils/format.js";
import { t } from "../utils/i18n.js";

export function scanCommand(): Command {
  return new Command("scan")
    .description(t("scanDescription"))
    .option("--json", t("commonJson"))
    .action(async (options: { json?: boolean }) => {
      const snapshot = await readCurrentSnapshot();
      if (options.json) {
        console.log(redactedJson(snapshot));
        return;
      }
      console.log(chalk.bold(t("scanHeader")));
      for (const line of snapshotSummary(snapshot)) console.log(line);
    });
}
