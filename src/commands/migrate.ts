import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { t } from "../utils/i18n.js";
import { CcxError } from "../utils/errors.js";
import { promptCheckbox } from "../utils/prompts.js";
import { saveAgentProfile } from "../core/agent-profiles.js";
import { FullSnapshot } from "../types/schema.js";

interface ProviderRow {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
}

export function migrateCommand(): Command {
  const cmd = new Command("migrate-ccs");
  cmd.description("Migrate presets from cc-switch database to ccx profiles");
  
  cmd.action(async () => {
    const dbPath = path.join(os.homedir(), ".cc-switch", "cc-switch.db");
    
    if (!(await fs.pathExists(dbPath))) {
      throw new CcxError(
        "cc-switch database not found.",
        `Looked at: ${dbPath}`
      );
    }

    const spinner = ora("Connecting to cc-switch database...").start();
    let db;
    try {
      db = new Database(dbPath, { readonly: true });
    } catch (e: any) {
      spinner.fail("Failed to connect to database");
      throw new CcxError(`Database error: ${e.message}`);
    }

    try {
      // Query claude and codex configs
      const stmt = db.prepare(`
        SELECT id, app_type, name, settings_config 
        FROM providers 
        WHERE app_type IN ('claude', 'codex')
      `);
      
      const rows = stmt.all() as ProviderRow[];
      
      // Group by original name
      const grouped = new Map<string, ProviderRow[]>();
      for (const row of rows) {
        if (!grouped.has(row.name)) {
          grouped.set(row.name, []);
        }
        grouped.get(row.name)!.push(row);
      }

      if (grouped.size === 0) {
        spinner.info("No Claude or Codex presets found in cc-switch.");
        return;
      }
      
      spinner.stop();
      
      const choices = Array.from(grouped.entries()).map(([name, rows]) => {
        const hasClaude = rows.some(r => r.app_type === "claude");
        const hasCodex = rows.some(r => r.app_type === "codex");
        let suffix = "";
        if (hasClaude && hasCodex) suffix = chalk.gray(" (Claude & Codex)");
        else if (hasClaude) suffix = chalk.blue(" (Claude)");
        else if (hasCodex) suffix = chalk.green(" (Codex)");
        
        return {
          name: `${name}${suffix}`,
          value: name,
          checked: true
        };
      });
      
      const selectedNames = await promptCheckbox(t("migrateSelect"), choices);
      
      if (selectedNames.length === 0) {
        console.log(chalk.gray(t("migrateNone")));
        return;
      }

      spinner.start(t("migrateFound", { count: selectedNames.length }));
      
      const migratedNames: string[] = [];
      let successCount = 0;

      for (const [originalName, providerRows] of grouped.entries()) {
        if (!selectedNames.includes(originalName)) continue;
        
        const snapshot: FullSnapshot = {};
        
        for (const row of providerRows) {
          try {
            const configObj = JSON.parse(row.settings_config);
            if (row.app_type === "claude") {
              snapshot.claude = configObj;
            } else if (row.app_type === "codex") {
              snapshot.codex = { config: configObj };
            }
          } catch (e) {
            // Ignore parse errors for individual rows
          }
        }
        
        // Skip if snapshot is empty
        if (!snapshot.claude && !snapshot.codex) continue;

        // Sanitize name to create a valid ccx profile name
        let sanitizedName = originalName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
        // Remove leading/trailing dashes
        sanitizedName = sanitizedName.replace(/^-+|-+$/g, "");
        if (!sanitizedName) sanitizedName = `migrated-${Date.now()}`;
        
        let savedAny = false;
        if (snapshot.claude) {
          try {
            await saveAgentProfile("claude", sanitizedName, snapshot.claude as any, {
              displayName: originalName,
              description: "Migrated from cc-switch",
              force: true,
              markEnabled: false
            });
            savedAny = true;
          } catch (e: any) {
            console.warn(chalk.yellow(`\nWarning: Failed to save claude profile '${originalName}': ${e.message}`));
          }
        }

        if (snapshot.codex) {
          try {
            await saveAgentProfile("codex", sanitizedName, snapshot.codex as any, {
              displayName: originalName,
              description: "Migrated from cc-switch",
              force: true,
              markEnabled: false
            });
            savedAny = true;
          } catch (e: any) {
            console.warn(chalk.yellow(`\nWarning: Failed to save codex profile '${originalName}': ${e.message}`));
          }
        }

        if (savedAny) {
          migratedNames.push(originalName);
          successCount++;
        }
      }

      spinner.succeed(`Successfully migrated ${successCount} presets.`);
      if (migratedNames.length > 0) {
        console.log(chalk.green("Migrated presets:"));
        for (const name of migratedNames) {
          console.log(`  - ${name}`);
        }
      }
    } finally {
      db.close();
    }
  });
  
  return cmd;
}
