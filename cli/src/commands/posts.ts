import type { Command } from "commander";

import {
  collectSetter,
  executeCommand,
  mergeDefined,
  parseSetters,
} from "../command-helpers.js";

interface CampaignWithPosts {
  id: string;
  posts?: Array<Record<string, unknown>>;
}

export function registerPostCommands(program: Command): void {
  const posts = program.command("posts").description("Inspect and update posts");

  posts
    .command("list")
    .description("List posts, derived from campaign content")
    .option("--campaign-id <id>", "filter to a single campaign")
    .addHelpText("after", "\nExamples:\n  sociallab posts list\n  sociallab posts list --campaign-id camp_123\n")
    .action(async function action(options: { campaignId?: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        if (options.campaignId) {
          const campaign = await client.request<CampaignWithPosts>({
            path: "/api/db/campaigns",
            query: {
              id: options.campaignId,
              include_content: "true",
            },
          });
          return campaign.posts ?? [];
        }

        const campaigns = await client.request<Array<{ id: string }>>({
          path: "/api/db/campaigns",
          query: { limit: 100 },
        });
        const full = await Promise.all(
          campaigns.map((campaign) =>
            client.request<CampaignWithPosts>({
              path: "/api/db/campaigns",
              query: {
                id: campaign.id,
                include_content: "true",
              },
            }),
          ),
        );
        return full.flatMap((campaign) => campaign.posts ?? []);
      });
    });

  posts
    .command("update")
    .description("Update a post")
    .argument("<id>", "post id")
    .option("--content <value>", "forwarded for compatibility; backend currently ignores it")
    .option("--image-url <url>", "image URL")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab posts update post_123 --image-url https://cdn/image.png\n")
    .action(async function action(id: string, options: { content?: string; imageUrl?: string; set?: string[] }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PATCH",
            path: "/api/db/posts",
            query: { id },
            body: mergeDefined(
              parseSetters(options.set),
              {
                content: options.content,
                image_url: options.imageUrl,
              },
            ),
          }),
      );
    });
}
