import type { Command } from "commander";

import {
  collectSetter,
  defaultCampaignOptions,
  ensureNonEmptyBody,
  executeCommand,
  maybeImageReference,
  mergeDefined,
  parseInteger,
  parseSetters,
  readJsonInput,
  readTextInput,
} from "../command-helpers.js";

interface CampaignCommandOptions {
  limit?: number;
  offset?: number;
  includeContent?: boolean;
}

export function registerCampaignCommands(program: Command): void {
  const campaigns = program.command("campaigns").description("Manage campaigns");

  campaigns
    .command("list")
    .description("List campaigns")
    .option("--limit <number>", "max items", parseInteger)
    .option("--offset <number>", "offset", parseInteger)
    .option("--include-content", "include nested clips/posts/ads/carousels")
    .addHelpText("after", "\nExamples:\n  sociallab campaigns list\n  sociallab campaigns list --limit 10 --offset 20\n")
    .action(async function action(options: CampaignCommandOptions) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/db/campaigns",
            query: {
              limit: options.limit,
              offset: options.offset,
              include_content: options.includeContent ? "true" : undefined,
            },
          }),
      );
    });

  campaigns
    .command("get")
    .description("Get a campaign with nested content")
    .argument("<id>", "campaign id")
    .addHelpText("after", "\nExamples:\n  sociallab campaigns get camp_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/db/campaigns",
            query: {
              id,
              include_content: "true",
            },
          }),
      );
    });

  campaigns
    .command("create")
    .description("Create a campaign record")
    .requiredOption("--transcript <text|@file>", "raw transcript or @file")
    .option("--title <value>", "campaign title")
    .option("--brand-profile-id <id>", "brand profile id")
    .option("--status <value>", "initial status")
    .option("--options <json|@file>", "generation options JSON")
    .option("--data <json|@file>", "full request body merge")
    .addHelpText("after", "\nExamples:\n  sociallab campaigns create --transcript @transcript.txt --title \"Friday Special\"\n  sociallab campaigns create --transcript \"raw text\" --data @campaign.json\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const transcript = await readTextInput(String(options.transcript));
        const extraData = options.data
          ? await readJsonInput<Record<string, unknown>>(String(options.data))
          : {};
        const generationOptions = options.options
          ? await readJsonInput<Record<string, unknown>>(String(options.options))
          : undefined;

        const body = mergeDefined(
          extraData,
          {
            name: options.title,
            brand_profile_id: options["brandProfileId"],
            input_transcript: transcript,
            status: options.status,
            generation_options: generationOptions,
          },
        );

        return client.request({
          method: "POST",
          path: "/api/db/campaigns",
          body,
        });
      });
    });

  campaigns
    .command("delete")
    .description("Delete a campaign")
    .argument("<id>", "campaign id")
    .addHelpText("after", "\nExamples:\n  sociallab campaigns delete camp_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: "/api/db/campaigns",
          query: { id },
        });
        return { success: true, id };
      });
    });

  campaigns
    .command("update")
    .description("Update a campaign clip thumbnail (current backend route)")
    .argument("<clip-id>", "clip id")
    .option("--thumbnail-url <url>", "new thumbnail URL")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab campaigns update clip_123 --thumbnail-url https://cdn/img.png\n")
    .action(async function action(clipId: string, options: { thumbnailUrl?: string; set?: string[] }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const body = ensureNonEmptyBody(
          mergeDefined(
            parseSetters(options.set),
            { thumbnail_url: options.thumbnailUrl },
          ),
          "Provide at least one field to update.",
        );

        return client.request({
          method: "PATCH",
          path: "/api/db/campaigns",
          query: { clip_id: clipId },
          body,
        });
      });
    });

  campaigns
    .command("update-scene")
    .description("Update a campaign scene image")
    .argument("<clip-id>", "clip id")
    .argument("<scene-index>", "scene number", parseInteger)
    .requiredOption("--image-url <url>", "image URL")
    .addHelpText("after", "\nExamples:\n  sociallab campaigns update-scene clip_123 2 --image-url https://cdn/scene.png\n")
    .action(async function action(clipId: string, sceneIndex: number, options: { imageUrl: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PATCH",
            path: "/api/db/campaigns/scene",
            query: {
              clip_id: clipId,
              scene_number: sceneIndex,
            },
            body: {
              image_url: options.imageUrl,
            },
          }),
      );
    });

  campaigns
    .command("generate")
    .description("Generate a campaign with AI")
    .requiredOption("--transcript <text|@file>", "raw transcript or @file")
    .option("--options <json|@file>", "generation options JSON")
    .option("--brand-profile <json|@file>", "brand profile JSON")
    .option("--product-images <json|@file>", "array of image references JSON")
    .option("--inspiration-images <json|@file>", "array of image references JSON")
    .option("--collab-logo <url|path>", "single image source")
    .option("--composition-assets <json|@file>", "array of image references JSON")
    .option("--tone <value>", "tone override")
    .addHelpText("after", "\nExamples:\n  sociallab campaigns generate --transcript @meeting.txt\n  sociallab campaigns generate --transcript \"raw text\" --options @campaign-options.json --brand-profile @brand.json\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const transcript = await readTextInput(String(options.transcript));
        const requestBody = {
          transcript,
          options: options.options
            ? await readJsonInput<Record<string, unknown>>(String(options.options))
            : defaultCampaignOptions(),
          brandProfile: options.brandProfile
            ? await readJsonInput<Record<string, unknown>>(String(options.brandProfile))
            : {},
          productImages: options.productImages
            ? await readJsonInput<unknown[]>(String(options.productImages))
            : undefined,
          inspirationImages: options.inspirationImages
            ? await readJsonInput<unknown[]>(String(options.inspirationImages))
            : undefined,
          collabLogo: await maybeImageReference(options.collabLogo),
          compositionAssets: options.compositionAssets
            ? await readJsonInput<unknown[]>(String(options.compositionAssets))
            : undefined,
          toneOfVoiceOverride: options.tone,
        };

        return client.request({
          method: "POST",
          path: "/api/ai/campaign",
          body: requestBody,
        });
      });
    });
}
