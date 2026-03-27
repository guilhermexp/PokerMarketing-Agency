import type { Command } from "commander";

import {
  executeCommand,
  parseInteger,
  readJsonInput,
} from "../command-helpers.js";

export function registerPlaygroundCommands(program: Command): void {
  const playground = program.command("playground").description("Manage image and video playgrounds");
  const image = playground.command("image").description("Image playground");
  const video = playground.command("video").description("Video playground");

  image
    .command("topics")
    .description("List image playground topics")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/image-playground/topics" }),
      );
    });

  image
    .command("create-topic")
    .description("Create an image playground topic")
    .requiredOption("--name <value>", "topic title")
    .addHelpText("after", "\nExamples:\n  sociallab playground image create-topic --name \"Flyers Abril\"\n")
    .action(async function action(options: { name: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/image-playground/topics",
            body: { title: options.name },
          }),
      );
    });

  image
    .command("update-topic")
    .description("Update an image playground topic")
    .argument("<id>", "topic id")
    .option("--name <value>", "topic title")
    .option("--cover-url <url>", "cover URL")
    .addHelpText("after", "\nExamples:\n  sociallab playground image update-topic topic_123 --name \"Novo nome\"\n")
    .action(async function action(id: string, options: { name?: string; coverUrl?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PATCH",
            path: `/api/image-playground/topics/${id}`,
            body: {
              title: options.name,
              coverUrl: options.coverUrl,
            },
          }),
      );
    });

  image
    .command("delete-topic")
    .description("Delete an image playground topic")
    .argument("<id>", "topic id")
    .addHelpText("after", "\nExamples:\n  sociallab playground image delete-topic topic_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: `/api/image-playground/topics/${id}`,
        });
        return { success: true, id };
      });
    });

  image
    .command("generate")
    .description("Create an image playground batch")
    .requiredOption("--topic-id <id>", "topic id")
    .requiredOption("--prompt <value>", "prompt text")
    .option("--count <number>", "image count", parseInteger, 1)
    .option("--provider <value>", "provider", "google")
    .option("--model <value>", "model", "nano-banana-2")
    .option("--params <json|@file>", "full params JSON merge")
    .addHelpText("after", "\nExamples:\n  sociallab playground image generate --topic-id topic_123 --prompt \"luxury flyer\" --count 4\n")
    .action(async function action(options: { topicId: string; prompt: string; count: number; provider: string; model: string; params?: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const params = options.params
          ? await readJsonInput<Record<string, unknown>>(options.params)
          : {};

        return client.request({
          method: "POST",
          path: "/api/image-playground/generate",
          body: {
            topicId: options.topicId,
            provider: options.provider,
            model: options.model,
            imageNum: options.count,
            params: {
              prompt: options.prompt,
              ...params,
            },
          },
        });
      });
    });

  image
    .command("status")
    .description("Check image generation status")
    .argument("<id>", "generation id")
    .option("--async-task-id <id>", "optional async task id")
    .addHelpText("after", "\nExamples:\n  sociallab playground image status gen_123\n")
    .action(async function action(id: string, options: { asyncTaskId?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: `/api/image-playground/status/${id}`,
            query: {
              asyncTaskId: options.asyncTaskId,
            },
          }),
      );
    });

  video
    .command("topics")
    .description("List video playground topics")
    .action(async function action() {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: "/api/video-playground/topics" }),
      );
    });

  video
    .command("create-topic")
    .description("Create a video playground topic")
    .requiredOption("--name <value>", "topic title")
    .addHelpText("after", "\nExamples:\n  sociallab playground video create-topic --name \"Teasers\"\n")
    .action(async function action(options: { name: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/video-playground/topics",
            body: { title: options.name },
          }),
      );
    });

  video
    .command("update-topic")
    .description("Update a video playground topic")
    .argument("<id>", "topic id")
    .option("--name <value>", "topic title")
    .option("--cover-url <url>", "cover URL")
    .addHelpText("after", "\nExamples:\n  sociallab playground video update-topic topic_123 --name \"Shorts\"\n")
    .action(async function action(id: string, options: { name?: string; coverUrl?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "PATCH",
            path: `/api/video-playground/topics/${id}`,
            body: {
              title: options.name,
              coverUrl: options.coverUrl,
            },
          }),
      );
    });

  video
    .command("delete-topic")
    .description("Delete a video playground topic")
    .argument("<id>", "topic id")
    .addHelpText("after", "\nExamples:\n  sociallab playground video delete-topic topic_123\n")
    .action(async function action(id: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: `/api/video-playground/topics/${id}`,
        });
        return { success: true, id };
      });
    });

  video
    .command("generate")
    .description("Create a video playground session")
    .requiredOption("--topic-id <id>", "topic id")
    .requiredOption("--prompt <value>", "prompt text")
    .option("--model <value>", "video model", "veo-3.1")
    .option("--count <number>", "accepted for compatibility; current backend creates one session", parseInteger)
    .option("--aspect-ratio <value>", "aspect ratio")
    .option("--resolution <value>", "resolution")
    .option("--reference-image-url <url>", "reference image URL")
    .addHelpText("after", "\nExamples:\n  sociallab playground video generate --topic-id topic_123 --prompt \"cinematic teaser\"\n")
    .action(async function action(options: Record<string, string | number | undefined>) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/video-playground/generate",
            body: {
              topicId: options.topicId,
              prompt: options.prompt,
              model: options.model,
              aspectRatio: options.aspectRatio,
              resolution: options.resolution,
              referenceImageUrl: options.referenceImageUrl,
            },
          }),
      );
    });

  video
    .command("status")
    .description("List video sessions for a topic (closest current backend status view)")
    .argument("<topic-id>", "topic id")
    .option("--limit <number>", "session limit", parseInteger, 20)
    .addHelpText("after", "\nExamples:\n  sociallab playground video status topic_123\n")
    .action(async function action(topicId: string, options: { limit: number }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/video-playground/sessions",
            query: {
              topicId,
              limit: options.limit,
            },
          }),
      );
    });
}
