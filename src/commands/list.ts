import { Command } from "commander";
import { printAllAgentProfiles } from "./agent.js";
import { t } from "../utils/i18n.js";

export function listCommand(): Command {
  return new Command("list")
    .alias("ls")
    .description(t("listDescription"))
    .action(async () => {
      await printAllAgentProfiles();
    });
}
