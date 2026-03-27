import type { Command } from "commander";

import {
  collectSetter,
  executeCommand,
  findById,
  mergeDefined,
  parseInteger,
  parseSetters,
} from "../command-helpers.js";

interface GalleryListItem {
  id?: string;
  [key: string]: unknown;
}

export function registerGalleryCommands(program: Command): void {
  const gallery = program.command("gallery").description("Manage gallery assets");

  gallery
    .command("list")
    .description("List gallery assets")
    .option("--limit <number>", "max items", parseInteger)
    .option("--source <value>", "filter by source")
    .addHelpText("after", "\nExamples:\n  sociallab gallery list\n  sociallab gallery list --limit 50 --source cli\n")
    .action(async function action(options: { limit?: number; source?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/db/gallery",
            query: {
              limit: options.limit,
              source: options.source,
            },
          }),
      );
    });

  gallery
    .command("get")
    .description("Best-effort gallery lookup by id")
    .argument("<id>", "gallery image id")
    .addHelpText("after", "\nExamples:\n  sociallab gallery get img_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const items = await client.request<GalleryListItem[]>({
          path: "/api/db/gallery",
          query: { limit: 500 },
        });
        return findById(items, id);
      });
    });

  gallery
    .command("add")
    .description("Add an asset to the gallery")
    .requiredOption("--url <value>", "asset URL")
    .option("--prompt <value>", "original prompt")
    .option("--model <value>", "model name", "manual-upload")
    .option("--source <value>", "source name", "cli")
    .option("--aspect-ratio <value>", "aspect ratio")
    .option("--image-size <value>", "image size label")
    .addHelpText("after", "\nExamples:\n  sociallab gallery add --url https://cdn/image.png --prompt \"hero shot\"\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/db/gallery",
            body: {
              src_url: options.url,
              prompt: options.prompt,
              model: options.model,
              source: options.source,
              aspect_ratio: options.aspectRatio,
              image_size: options.imageSize,
            },
          }),
      );
    });

  gallery
    .command("update")
    .description("Update gallery metadata")
    .argument("<id>", "gallery image id")
    .option("--published-at <iso>", "published timestamp or null")
    .option("--src-url <url>", "replace src_url")
    .option("--style-reference-name <value>", "style reference label")
    .option("--is-style-reference <true|false>", "set style reference flag")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab gallery update img_123 --published-at 2026-03-26T10:00:00.000Z\n")
    .action(async function action(id: string, options: Record<string, string | string[] | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const body = mergeDefined(
          parseSetters((options.set as string[] | undefined) ?? []),
          {
            published_at: options.publishedAt === "null" ? null : options.publishedAt,
            src_url: options.srcUrl,
            style_reference_name: options.styleReferenceName,
            is_style_reference:
              typeof options.isStyleReference === "string"
                ? options.isStyleReference === "true"
                : undefined,
          },
        );

        return client.request({
          method: "PATCH",
          path: "/api/db/gallery",
          query: { id },
          body,
        });
      });
    });

  gallery
    .command("delete")
    .description("Delete a gallery asset")
    .argument("<id>", "gallery image id")
    .addHelpText("after", "\nExamples:\n  sociallab gallery delete img_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: "/api/db/gallery",
          query: { id },
        });
        return { success: true, id };
      });
    });

  gallery
    .command("daily-flyers")
    .description("List daily flyers for a tournament week schedule")
    .requiredOption("--week-schedule-id <id>", "week schedule id")
    .addHelpText("after", "\nExamples:\n  sociallab gallery daily-flyers --week-schedule-id week_123\n")
    .action(async function action(options: { weekScheduleId: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/db/gallery/daily-flyers",
            query: {
              week_schedule_id: options.weekScheduleId,
            },
          }),
      );
    });
}
