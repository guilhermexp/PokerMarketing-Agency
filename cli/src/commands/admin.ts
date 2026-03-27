import type { Command } from "commander";

import { executeCommand, parseInteger } from "../command-helpers.js";

export function registerAdminCommands(program: Command): void {
  const admin = program.command("admin").description("Admin and usage endpoints");

  admin
    .command("stats")
    .description("Fetch admin stats")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/admin/stats" }),
      );
    });

  admin
    .command("users")
    .description("List users")
    .option("--limit <number>", "page size", parseInteger)
    .option("--page <number>", "page number", parseInteger)
    .option("--search <value>", "search by name/email")
    .addHelpText("after", "\nExamples:\n  sociallab admin users --limit 50 --page 1\n")
    .action(async function action(options: { limit?: number; page?: number; search?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/admin/users",
            query: options,
          }),
      );
    });

  admin
    .command("orgs")
    .description("List organizations")
    .option("--limit <number>", "page size", parseInteger)
    .option("--page <number>", "page number", parseInteger)
    .addHelpText("after", "\nExamples:\n  sociallab admin orgs --limit 50 --page 2\n")
    .action(async function action(options: { limit?: number; page?: number }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/admin/organizations",
            query: options,
          }),
      );
    });

  admin
    .command("usage")
    .description("Fetch AI usage analytics")
    .option("--days <number>", "number of days", parseInteger)
    .option("--group-by <value>", "day | provider | model | operation")
    .addHelpText("after", "\nExamples:\n  sociallab admin usage --days 30 --group-by model\n")
    .action(async function action(options: { days?: number; groupBy?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/admin/usage",
            query: options,
          }),
      );
    });

  admin
    .command("logs")
    .description("List admin logs")
    .option("--limit <number>", "page size", parseInteger)
    .option("--page <number>", "page number", parseInteger)
    .option("--action <value>", "action filter")
    .option("--category <value>", "category filter")
    .option("--severity <value>", "severity filter")
    .addHelpText("after", "\nExamples:\n  sociallab admin logs --severity error --limit 20\n")
    .action(async function action(options: Record<string, string | number | undefined>) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/admin/logs",
            query: options,
          }),
      );
    });

  admin
    .command("log")
    .description("Get a single admin log")
    .argument("<id>", "log id")
    .addHelpText("after", "\nExamples:\n  sociallab admin log log_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: `/api/admin/logs/${id}` }),
      );
    });

  admin
    .command("suggest")
    .description("Generate AI suggestions for a failed log")
    .argument("<log-id>", "log id")
    .addHelpText("after", "\nExamples:\n  sociallab admin suggest log_123\n")
    .action(async function action(logId: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: `/api/admin/logs/${logId}/ai-suggestions`,
          }),
      );
    });
}
