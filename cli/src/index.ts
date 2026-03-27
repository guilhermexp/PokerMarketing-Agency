#!/usr/bin/env node
import { Command } from "commander";

import { registerConfigCommands } from "./commands/config.js";
import { registerHealthCommands } from "./commands/health.js";
import { registerCampaignCommands } from "./commands/campaigns.js";
import { registerGalleryCommands } from "./commands/gallery.js";
import { registerPostCommands } from "./commands/posts.js";
import { registerAdCommands } from "./commands/ads.js";
import { registerCarouselCommands } from "./commands/carousels.js";
import { registerScheduleCommands } from "./commands/schedule.js";
import { registerBrandCommands } from "./commands/brand.js";
import { registerInstagramCommands } from "./commands/instagram.js";
import { registerTournamentCommands } from "./commands/tournaments.js";
import { registerAiCommands } from "./commands/ai.js";
import { registerPlaygroundCommands } from "./commands/playground.js";
import { registerAdminCommands } from "./commands/admin.js";
import { registerAgentCommands } from "./commands/agent.js";
import { registerUploadCommands } from "./commands/upload.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("sociallab")
    .description("Standalone CLI for SocialLab (PokerMarketing-Agency)")
    .option("--pretty", "format output as a simple table when possible")
    .option("--quiet", "suppress stdout output")
    .showHelpAfterError();

  registerConfigCommands(program);
  registerHealthCommands(program);
  registerCampaignCommands(program);
  registerGalleryCommands(program);
  registerPostCommands(program);
  registerAdCommands(program);
  registerCarouselCommands(program);
  registerScheduleCommands(program);
  registerBrandCommands(program);
  registerInstagramCommands(program);
  registerTournamentCommands(program);
  registerAiCommands(program);
  registerPlaygroundCommands(program);
  registerAdminCommands(program);
  registerAgentCommands(program);
  registerUploadCommands(program);

  return program;
}

export async function run(argv = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
