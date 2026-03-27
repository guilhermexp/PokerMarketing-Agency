import type { Command } from "commander";

import {
  collectSetter,
  executeCommand,
  findById,
  mergeDefined,
  parseInteger,
  parseSetters,
  readJsonInput,
} from "../command-helpers.js";

interface CarouselItem {
  id?: string;
  title?: string;
  [key: string]: unknown;
}

export function registerCarouselCommands(program: Command): void {
  const carousels = program.command("carousels").description("Inspect and update carousels");

  carousels
    .command("list")
    .description("List carousels")
    .addHelpText("after", "\nExamples:\n  sociallab carousels list\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/db/carousels" }),
      );
    });

  carousels
    .command("get")
    .description("Get a carousel by id")
    .argument("<id>", "carousel id")
    .addHelpText("after", "\nExamples:\n  sociallab carousels get car_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const items = await client.request<CarouselItem[]>({
          path: "/api/db/carousels",
        });
        return findById(items, id);
      });
    });

  carousels
    .command("create")
    .description("Create a carousel via campaign creation fallback")
    .requiredOption("--data <json|@file>", "carousel JSON or full campaign payload")
    .addHelpText("after", "\nExamples:\n  sociallab carousels create --data @carousel.json\n")
    .action(async function action(options: { data: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const payload = await readJsonInput<Record<string, unknown>>(options.data);
        const body = "carousel_scripts" in payload
          ? payload
          : {
              name: payload.title || "CLI Carousel",
              carousel_scripts: [payload],
            };

        return client.request({
          method: "POST",
          path: "/api/db/campaigns",
          body,
        });
      });
    });

  carousels
    .command("update")
    .description("Update carousel cover/caption")
    .argument("<id>", "carousel id")
    .option("--cover-url <url>", "cover image URL")
    .option("--caption <value>", "caption text")
    .option("--data <json|@file>", "body JSON merge")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab carousels update car_123 --cover-url https://cdn/cover.png\n")
    .action(async function action(id: string, options: { coverUrl?: string; caption?: string; data?: string; set?: string[] }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const data = options.data
          ? await readJsonInput<Record<string, unknown>>(options.data)
          : {};

        return client.request({
          method: "PATCH",
          path: "/api/db/carousels",
          query: { id },
          body: mergeDefined(
            data,
            parseSetters(options.set),
            {
              cover_url: options.coverUrl,
              caption: options.caption,
            },
          ),
        });
      });
    });

  carousels
    .command("update-slide")
    .description("Update an individual carousel slide image")
    .argument("<carousel-id>", "carousel id")
    .argument("<slide-number>", "slide number", parseInteger)
    .requiredOption("--image-url <url>", "slide image URL")
    .addHelpText("after", "\nExamples:\n  sociallab carousels update-slide car_123 2 --image-url https://cdn/slide.png\n")
    .action(async function action(carouselId: string, slideNumber: number, options: { imageUrl: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PATCH",
            path: "/api/db/carousels/slide",
            query: {
              carousel_id: carouselId,
              slide_number: slideNumber,
            },
            body: {
              image_url: options.imageUrl,
            },
          }),
      );
    });
}
