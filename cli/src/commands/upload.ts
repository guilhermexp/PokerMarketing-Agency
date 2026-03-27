import type { Command } from "commander";

import { executeCommand } from "../command-helpers.js";

export function registerUploadCommands(program: Command): void {
  program
    .command("upload")
    .description("Upload a file to the API blob storage")
    .argument("<file>", "file path")
    .addHelpText("after", "\nExamples:\n  sociallab upload ./assets/banner.png\n")
    .action(async function action(file: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.uploadFile(file),
      );
    });
}
