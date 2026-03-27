import type { Command } from "commander";

import {
  executeCommand,
  getGlobalConfigPreview,
} from "../command-helpers.js";
import { loadConfig, saveConfigValue } from "../config.js";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage CLI configuration");

  config
    .command("show")
    .description("Show the effective CLI config")
    .addHelpText("after", "\nExamples:\n  sociallab config show\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async () => {
          const loaded = await loadConfig();
          return getGlobalConfigPreview(loaded);
        },
        { requireAuth: false },
      );
    });

  config
    .command("set")
    .description("Persist a config value to ~/.sociallabrc")
    .argument("<key>", "url | token | user_id | org_id")
    .argument("<value>", "value to persist")
    .addHelpText("after", "\nExamples:\n  sociallab config set url http://localhost:3002\n  sociallab config set user_id user_123\n")
    .action(async function action(key: string, value: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async () => {
          const next = await saveConfigValue(key, value);
          return getGlobalConfigPreview(next);
        },
        { requireAuth: false },
      );
    });
}
