import type { Command } from "commander";

import { executeCommand } from "../command-helpers.js";

export function registerHealthCommands(program: Command): void {
  program
    .command("health")
    .description("Check public API health")
    .addHelpText("after", "\nExamples:\n  sociallab health\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/health" }),
        { requireAuth: false },
      );
    });

  const db = program.command("db").description("Database health and init");

  db
    .command("health")
    .description("Check database health")
    .addHelpText("after", "\nExamples:\n  sociallab db health\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/db/health" }),
      );
    });

  db
    .command("init")
    .description("Fetch the unified initial dataset")
    .addHelpText("after", "\nExamples:\n  sociallab db init\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/db/init" }),
      );
    });
}
