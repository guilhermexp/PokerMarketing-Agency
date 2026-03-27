import type { Command } from "commander";

import { executeCommand } from "../command-helpers.js";

export function registerInstagramCommands(program: Command): void {
  const instagram = program.command("instagram").description("Manage Instagram accounts");

  instagram
    .command("list")
    .description("List Instagram accounts")
    .addHelpText("after", "\nExamples:\n  sociallab instagram list\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/db/instagram-accounts" }),
      );
    });

  instagram
    .command("add")
    .description("Connect an Instagram account")
    .requiredOption("--token <value>", "Rube token")
    .option("--ig-user-id <value>", "accepted for compatibility; resolved server-side")
    .option("--username <value>", "accepted for compatibility; resolved server-side")
    .addHelpText("after", "\nExamples:\n  sociallab instagram add --token rube_xxx\n")
    .action(async function action(options: { token: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/db/instagram-accounts",
            body: {
              rube_token: options.token,
            },
          }),
      );
    });

  instagram
    .command("update")
    .description("Update an Instagram account token")
    .argument("<id>", "Instagram account id")
    .requiredOption("--token <value>", "new Rube token")
    .addHelpText("after", "\nExamples:\n  sociallab instagram update ig_123 --token rube_xxx\n")
    .action(async function action(id: string, options: { token: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PUT",
            path: "/api/db/instagram-accounts",
            query: { id },
            body: {
              rube_token: options.token,
            },
          }),
      );
    });

  instagram
    .command("delete")
    .description("Disconnect an Instagram account")
    .argument("<id>", "Instagram account id")
    .addHelpText("after", "\nExamples:\n  sociallab instagram delete ig_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: "/api/db/instagram-accounts",
          query: { id },
        });
        return { success: true, id };
      });
    });
}
