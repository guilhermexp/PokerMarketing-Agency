import type { Command } from "commander";

import {
  collectSetter,
  ensureNonEmptyBody,
  executeCommand,
  mergeDefined,
  parseInteger,
  parseSetters,
} from "../command-helpers.js";

function normalizeScheduleTimestamp(value: string): {
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: number;
} {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --scheduled-at value: ${value}`);
  }

  const iso = date.toISOString();
  return {
    scheduled_date: iso.slice(0, 10),
    scheduled_time: iso.slice(11, 16),
    scheduled_timestamp: date.getTime(),
  };
}

export function registerScheduleCommands(program: Command): void {
  const schedule = program.command("schedule").description("Manage scheduled posts");

  schedule
    .command("list")
    .description("List scheduled posts")
    .option("--status <value>", "filter by status")
    .addHelpText("after", "\nExamples:\n  sociallab schedule list\n  sociallab schedule list --status scheduled\n")
    .action(async function action(options: { status?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/db/scheduled-posts",
            query: {
              status: options.status,
            },
          }),
      );
    });

  schedule
    .command("create")
    .description("Create a scheduled post")
    .requiredOption("--image-url <url>", "image URL")
    .requiredOption("--caption <value>", "caption text")
    .requiredOption("--scheduled-at <iso>", "ISO datetime")
    .option("--ig-account-id <id>", "Instagram account id")
    .option("--platforms <value>", "comma-separated platforms", "instagram")
    .option("--hashtags <value>", "comma-separated hashtags")
    .option("--timezone <value>", "timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)
    .addHelpText("after", "\nExamples:\n  sociallab schedule create --image-url https://cdn/img.png --caption \"Hoje\" --scheduled-at 2026-03-26T18:00:00-03:00\n")
    .action(async function action(options: Record<string, string>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const scheduleParts = normalizeScheduleTimestamp(options.scheduledAt);
        const hashtags = options.hashtags
          ? options.hashtags.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined;

        return client.request({
          method: "POST",
          path: "/api/db/scheduled-posts",
          body: {
            image_url: options.imageUrl,
            caption: options.caption,
            instagram_account_id: options.igAccountId,
            hashtags,
            timezone: options.timezone,
            platforms: options.platforms,
            content_type: "image",
            ...scheduleParts,
          },
        });
      });
    });

  schedule
    .command("update")
    .description("Update a scheduled post")
    .argument("<id>", "scheduled post id")
    .option("--status <value>", "new status")
    .option("--published-at <iso|null>", "publish timestamp or null")
    .option("--error-message <value>", "error message")
    .option("--instagram-media-id <value>", "published media id")
    .option("--publish-attempts <number>", "publish attempts", parseInteger)
    .option("--last-publish-attempt <iso|null>", "last publish attempt")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab schedule update sched_123 --status published --published-at 2026-03-26T21:00:00.000Z\n")
    .action(async function action(id: string, options: Record<string, string | number | string[] | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const body = ensureNonEmptyBody(
          mergeDefined(
            parseSetters((options.set as string[] | undefined) ?? []),
            {
              status: options.status,
              published_at: options.publishedAt === "null" ? null : options.publishedAt,
              error_message: options.errorMessage,
              instagram_media_id: options.instagramMediaId,
              publish_attempts: options.publishAttempts,
              last_publish_attempt:
                options.lastPublishAttempt === "null"
                  ? null
                  : options.lastPublishAttempt,
            },
          ),
          "Provide at least one field to update.",
        );

        return client.request({
          method: "PUT",
          path: "/api/db/scheduled-posts",
          query: { id },
          body,
        });
      });
    });

  schedule
    .command("delete")
    .description("Delete a scheduled post")
    .argument("<id>", "scheduled post id")
    .addHelpText("after", "\nExamples:\n  sociallab schedule delete sched_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: "/api/db/scheduled-posts",
          query: { id },
        });
        return { success: true, id };
      });
    });

  schedule
    .command("retry")
    .description("Retry a scheduled post publish")
    .argument("<id>", "scheduled post id")
    .addHelpText("after", "\nExamples:\n  sociallab schedule retry sched_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/db/scheduled-posts/retry",
            body: { id },
          }),
      );
    });
}
