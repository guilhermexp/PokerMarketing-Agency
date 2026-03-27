import type { Command } from "commander";

import {
  NO_OUTPUT,
  executeCommand,
  parseInteger,
  readJsonInput,
} from "../command-helpers.js";

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Studio agent endpoints");

  agent
    .command("chat")
    .description("Open an SSE chat stream")
    .requiredOption("--prompt <value>", "message text")
    .option("--studio-type <image|video>", "studio type", "image")
    .option("--topic-id <value>", "topic id", "cli")
    .option("--thread-id <value>", "existing thread id")
    .option("--attachments <json|@file>", "attachments JSON array")
    .option("--mentions <json|@file>", "mentions JSON array")
    .addHelpText("after", "\nExamples:\n  sociallab agent chat --prompt \"Gere ideias para flyer\"\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const attachments = options.attachments
          ? await readJsonInput<unknown[]>(String(options.attachments))
          : [];
        const mentions = options.mentions
          ? await readJsonInput<unknown[]>(String(options.mentions))
          : [];

        await client.stream(
          "/api/agent/studio/stream",
          {
            studioType: options.studioType,
            topicId: options.topicId,
            message: options.prompt,
            threadId: options.threadId,
            attachments,
            mentions,
          },
          (event) => {
            process.stdout.write(`${JSON.stringify(event.data)}\n`);
          },
        );

        return NO_OUTPUT;
      });
    });

  agent
    .command("history")
    .description("Fetch thread history")
    .option("--studio-type <image|video>", "studio type", "image")
    .option("--topic-id <value>", "topic id", "cli")
    .addHelpText("after", "\nExamples:\n  sociallab agent history --studio-type video --topic-id launch-week\n")
    .action(async function action(options: { studioType: string; topicId: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/agent/studio/history",
            query: {
              studioType: options.studioType,
              topicId: options.topicId,
            },
          }),
      );
    });

  agent
    .command("reset")
    .description("Reset a studio thread")
    .option("--thread-id <value>", "thread id")
    .option("--studio-type <image|video>", "studio type", "image")
    .option("--topic-id <value>", "topic id", "cli")
    .addHelpText("after", "\nExamples:\n  sociallab agent reset --thread-id thread_123\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/agent/studio/reset",
            body: {
              threadId: options.threadId,
              studioType: options.threadId ? undefined : options.studioType,
              topicId: options.threadId ? undefined : options.topicId,
            },
          }),
      );
    });

  agent
    .command("files")
    .description("Search project files exposed by the studio agent")
    .option("--query <value>", "search query", "")
    .option("--limit <number>", "limit", parseInteger, 20)
    .addHelpText("after", "\nExamples:\n  sociallab agent files --query campaign --limit 10\n")
    .action(async function action(options: { query: string; limit: number }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/agent/studio/files",
            query: options,
          }),
      );
    });

  agent
    .command("answer")
    .description("Answer a pending agent interaction")
    .requiredOption("--thread-id <value>", "thread id")
    .requiredOption("--interaction-id <value>", "interaction id")
    .option("--answer <value>", "string answer")
    .option("--data <json|@file>", "full answer payload JSON")
    .addHelpText("after", "\nExamples:\n  sociallab agent answer --thread-id thread_123 --interaction-id int_456 --answer \"Sim\"\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const answer = options.data
          ? await readJsonInput<Record<string, unknown>>(String(options.data))
          : options.answer;

        return client.request({
          method: "POST",
          path: "/api/agent/studio/answer",
          body: {
            threadId: options.threadId,
            interactionId: options.interactionId,
            answer,
          },
        });
      });
    });

  agent
    .command("search-content")
    .description("Search content mentions for the studio agent")
    .requiredOption("--type <gallery|campaign|post|clip|carousel>", "content type")
    .option("--query <value>", "search query", "")
    .option("--limit <number>", "limit", parseInteger, 10)
    .addHelpText("after", "\nExamples:\n  sociallab agent search-content --type campaign --query festival\n")
    .action(async function action(options: { type: string; query: string; limit: number }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/agent/studio/content-search",
            query: options,
          }),
      );
    });
}
