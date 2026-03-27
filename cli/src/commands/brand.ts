import type { Command } from "commander";

import {
  collectSetter,
  ensureNonEmptyBody,
  executeCommand,
  mergeDefined,
  parseSetters,
  readJsonInput,
} from "../command-helpers.js";

function mapColors(colors?: Record<string, unknown>): Record<string, unknown> {
  if (!colors) return {};
  return {
    primary_color: colors.primary,
    secondary_color: colors.secondary,
    tertiary_color: colors.tertiary,
  };
}

export function registerBrandCommands(program: Command): void {
  const brand = program.command("brand").description("Manage brand profiles");

  brand
    .command("list")
    .description("Fetch the active brand profile")
    .addHelpText("after", "\nExamples:\n  sociallab brand list\n")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/db/brand-profiles" }),
      );
    });

  brand
    .command("create")
    .description("Create a brand profile")
    .requiredOption("--name <value>", "brand name")
    .option("--logo-url <url>", "logo URL")
    .option("--colors <json|@file>", "color JSON { primary, secondary, tertiary }")
    .option("--primary-color <value>", "primary color")
    .option("--secondary-color <value>", "secondary color")
    .option("--tone <value>", "tone of voice")
    .option("--description <value>", "brand description")
    .addHelpText("after", "\nExamples:\n  sociallab brand create --name SocialLab --colors '{\"primary\":\"#000\",\"secondary\":\"#fff\"}'\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const colors = options.colors
          ? await readJsonInput<Record<string, unknown>>(String(options.colors))
          : undefined;

        return client.request({
          method: "POST",
          path: "/api/db/brand-profiles",
          body: mergeDefined(
            mapColors(colors),
            {
              name: options.name,
              logo_url: options.logoUrl,
              description: options.description,
              primary_color: options.primaryColor,
              secondary_color: options.secondaryColor,
              tone_of_voice: options.tone,
            },
          ),
        });
      });
    });

  brand
    .command("update")
    .description("Update a brand profile")
    .argument("<id>", "brand profile id")
    .option("--name <value>", "brand name")
    .option("--logo-url <url>", "logo URL")
    .option("--colors <json|@file>", "color JSON { primary, secondary, tertiary }")
    .option("--primary-color <value>", "primary color")
    .option("--secondary-color <value>", "secondary color")
    .option("--tone <value>", "tone of voice")
    .option("--description <value>", "brand description")
    .option("--set <key=value>", "extra body field", collectSetter, [])
    .addHelpText("after", "\nExamples:\n  sociallab brand update brand_123 --logo-url https://cdn/logo.png\n")
    .action(async function action(id: string, options: Record<string, string | string[] | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const colors = options.colors
          ? await readJsonInput<Record<string, unknown>>(String(options.colors))
          : undefined;
        const body = ensureNonEmptyBody(
          mergeDefined(
            parseSetters((options.set as string[] | undefined) ?? []),
            mapColors(colors),
            {
              name: options.name,
              logo_url: options.logoUrl,
              description: options.description,
              primary_color: options.primaryColor,
              secondary_color: options.secondaryColor,
              tone_of_voice: options.tone,
            },
          ),
          "Provide at least one field to update.",
        );

        return client.request({
          method: "PUT",
          path: "/api/db/brand-profiles",
          query: { id },
          body,
        });
      });
    });
}
