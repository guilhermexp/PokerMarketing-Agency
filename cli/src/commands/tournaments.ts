import type { Command } from "commander";

import {
  executeCommand,
  parseInteger,
  readJsonInput,
} from "../command-helpers.js";
import { CliError } from "../client.js";

export function registerTournamentCommands(program: Command): void {
  const tournaments = program.command("tournaments").description("Manage tournament schedules");

  tournaments
    .command("list")
    .description("List the latest tournament schedule or events for a week")
    .option("--week-schedule-id <id>", "return events for a specific week schedule")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments list\n  sociallab tournaments list --week-schedule-id week_123\n")
    .action(async function action(options: { weekScheduleId?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/db/tournaments",
            query: {
              week_schedule_id: options.weekScheduleId,
            },
          }),
      );
    });

  tournaments
    .command("create")
    .description("Create a week schedule")
    .requiredOption("--data <json|@file>", "request body JSON")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments create --data @week-schedule.json\n")
    .action(async function action(options: { data: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const data = await readJsonInput<Record<string, unknown>>(options.data);
        return client.request({
          method: "POST",
          path: "/api/db/tournaments",
          body: data,
        });
      });
    });

  tournaments
    .command("update")
    .description("No dedicated update endpoint exists in the current backend")
    .argument("<id>", "week schedule id")
    .requiredOption("--data <json|@file>", "accepted for compatibility")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments update week_123 --data @week.json\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(command, async () => {
        throw new CliError(
          "The current backend does not expose PUT /api/db/tournaments. Use delete + create or the flyer-specific tournament commands.",
        );
      });
    });

  tournaments
    .command("delete")
    .description("Delete a week schedule")
    .argument("<id>", "week schedule id")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments delete week_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: "/api/db/tournaments",
          query: { id },
        });
        return { success: true, id };
      });
    });

  tournaments
    .command("weeks")
    .description("List all week schedules")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments weeks\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/db/tournaments/list" }),
      );
    });

  tournaments
    .command("event-flyer")
    .description("Patch tournament event flyer URLs")
    .argument("<event-id>", "tournament event id")
    .requiredOption("--action <add|remove|set>", "patch action")
    .option("--url <value>", "single flyer URL")
    .option("--urls <json|@file>", "URL array for action=set")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments event-flyer event_123 --action add --url https://cdn/flyer.png\n")
    .action(async function action(eventId: string, options: { action: string; url?: string; urls?: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const flyerUrls = options.urls
          ? await readJsonInput<string[]>(options.urls)
          : undefined;
        return client.request({
          method: "PATCH",
          path: "/api/db/tournaments/event-flyer",
          query: { event_id: eventId },
          body: {
            action: options.action,
            flyer_url: options.url,
            flyer_urls: flyerUrls,
          },
        });
      });
    });

  tournaments
    .command("daily-flyer")
    .description("Patch daily flyer URLs on a week schedule")
    .argument("<schedule-id>", "week schedule id")
    .requiredOption("--period <value>", "period key")
    .requiredOption("--action <add|remove|set>", "patch action")
    .option("--day <value>", "day key")
    .option("--url <value>", "single flyer URL")
    .option("--urls <json|@file>", "URL array for action=set")
    .addHelpText("after", "\nExamples:\n  sociallab tournaments daily-flyer week_123 --period night --action add --url https://cdn/flyer.png\n")
    .action(async function action(scheduleId: string, options: { period: string; action: string; day?: string; url?: string; urls?: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const flyerUrls = options.urls
          ? await readJsonInput<string[]>(options.urls)
          : undefined;
        return client.request({
          method: "PATCH",
          path: "/api/db/tournaments/daily-flyer",
          query: {
            schedule_id: scheduleId,
            period: options.period,
            day: options.day,
          },
          body: {
            action: options.action,
            flyer_url: options.url,
            flyer_urls: flyerUrls,
          },
        });
      });
    });
}
