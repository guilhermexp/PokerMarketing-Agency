import type { Command } from "commander";

import {
  collectSetter,
  executeCommand,
  mergeDefined,
  parseSetters,
} from "../command-helpers.js";

interface CampaignWithAds {
  id: string;
  ad_creatives?: Array<Record<string, unknown>>;
}

export function registerAdCommands(program: Command): void {
  const ads = program.command("ads").description("Inspect and update ad creatives");

  ads
    .command("list")
    .description("List ad creatives, derived from campaign content")
    .option("--campaign-id <id>", "filter to a single campaign")
    .addHelpText("after", "\nExamples:\n  sociallab ads list\n  sociallab ads list --campaign-id camp_123\n")
    .action(async function action(options: { campaignId?: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        if (options.campaignId) {
          const campaign = await client.request<CampaignWithAds>({
            path: "/api/db/campaigns",
            query: {
              id: options.campaignId,
              include_content: "true",
            },
          });
          return campaign.ad_creatives ?? [];
        }

        const campaigns = await client.request<Array<{ id: string }>>({
          path: "/api/db/campaigns",
          query: { limit: 100 },
        });
        const full = await Promise.all(
          campaigns.map((campaign) =>
            client.request<CampaignWithAds>({
              path: "/api/db/campaigns",
              query: {
                id: campaign.id,
                include_content: "true",
              },
            }),
          ),
        );
        return full.flatMap((campaign) => campaign.ad_creatives ?? []);
      });
    });

  ads
    .command("update")
    .description("Update an ad creative")
    .argument("<id>", "ad creative id")
    .option("--headline <value>", "forwarded for compatibility; backend currently ignores it")
    .option("--body <value>", "forwarded for compatibility; backend currently ignores it")
    .option("--image-url <url>", "image URL")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab ads update ad_123 --image-url https://cdn/ad.png\n")
    .action(async function action(id: string, options: { headline?: string; body?: string; imageUrl?: string; set?: string[] }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PATCH",
            path: "/api/db/ad-creatives",
            query: { id },
            body: mergeDefined(
              parseSetters(options.set),
              {
                headline: options.headline,
                body: options.body,
                image_url: options.imageUrl,
              },
            ),
          }),
      );
    });
}
