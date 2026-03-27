import type { Command } from "commander";

import {
  executeCommand,
  maybeImageReference,
  parseInteger,
  readJsonInput,
} from "../command-helpers.js";
import { sourceToImageReference } from "../client.js";

export function registerAiCommands(program: Command): void {
  const ai = program.command("ai").description("Run AI generation endpoints");

  ai
    .command("image")
    .description("Generate an image")
    .requiredOption("--prompt <value>", "prompt text")
    .option("--model <value>", "image model", "nano-banana-2")
    .option("--size <value>", "image size", "1K")
    .option("--aspect-ratio <value>", "aspect ratio", "1:1")
    .option("--brand-profile <json|@file>", "brand profile JSON")
    .option("--product-images <json|@file>", "product images JSON array")
    .option("--style-reference <source>", "style reference image source")
    .option("--person-reference <source>", "person reference image source")
    .addHelpText("after", "\nExamples:\n  sociallab ai image --prompt \"poker tournament poster\" --aspect-ratio 9:16\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const brandProfile = options.brandProfile
          ? await readJsonInput<Record<string, unknown>>(String(options.brandProfile))
          : {};
        const productImages = options.productImages
          ? await readJsonInput<unknown[]>(String(options.productImages))
          : undefined;

        return client.request({
          method: "POST",
          path: "/api/ai/image",
          body: {
            prompt: options.prompt,
            model: options.model,
            imageSize: options.size,
            aspectRatio: options.aspectRatio,
            brandProfile,
            productImages,
            styleReferenceImage: await maybeImageReference(options.styleReference),
            personReferenceImage: await maybeImageReference(options.personReference),
          },
        });
      });
    });

  ai
    .command("edit-image")
    .description("Edit an image")
    .requiredOption("--image-url <source>", "image URL, data URL or @file")
    .requiredOption("--prompt <value>", "edit prompt")
    .option("--mask <source>", "mask image source")
    .option("--reference-image <source>", "reference image source")
    .option("--aspect-ratio <value>", "aspect ratio")
    .option("--size <value>", "image size", "1K")
    .addHelpText("after", "\nExamples:\n  sociallab ai edit-image --image-url https://cdn/image.png --prompt \"remove background\"\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const image = await sourceToImageReference(String(options.imageUrl));

        return client.request({
          method: "POST",
          path: "/api/ai/edit-image",
          body: {
            image,
            prompt: options.prompt,
            mask: await maybeImageReference(options.mask),
            referenceImage: await maybeImageReference(options.referenceImage),
            aspectRatio: options.aspectRatio,
            imageSize: options.size,
          },
        });
      });
    });

  ai
    .command("text")
    .description("Generate text")
    .requiredOption("--prompt <value>", "user prompt")
    .option("--type <value>", "generation type")
    .option("--context <value>", "context text")
    .option("--system-prompt <value>", "system prompt")
    .option("--brand-profile <json|@file>", "brand profile JSON")
    .option("--temperature <value>", "temperature")
    .option("--response-schema <json|@file>", "response schema JSON")
    .addHelpText("after", "\nExamples:\n  sociallab ai text --prompt \"write a caption\"\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const brandProfile = options.brandProfile
          ? await readJsonInput<Record<string, unknown>>(String(options.brandProfile))
          : {};
        const responseSchema = options.responseSchema
          ? await readJsonInput<Record<string, unknown>>(String(options.responseSchema))
          : undefined;

        return client.request({
          method: "POST",
          path: "/api/ai/text",
          body: {
            type: options.type,
            context: options.context,
            systemPrompt: options.systemPrompt,
            userPrompt: options.prompt,
            brandProfile,
            temperature: options.temperature ? Number(options.temperature) : undefined,
            responseSchema,
          },
        });
      });
    });

  ai
    .command("video")
    .description("Generate a video")
    .requiredOption("--prompt <value>", "video prompt")
    .option("--model <value>", "video model", "veo-3.1-fast-generate-preview")
    .option("--aspect-ratio <value>", "aspect ratio", "16:9")
    .option("--resolution <value>", "resolution", "720p")
    .option("--image-url <value>", "reference image URL")
    .option("--last-frame-url <value>", "last frame URL")
    .option("--scene-duration <seconds>", "scene duration seconds")
    .option("--generate-audio <true|false>", "generate audio", "true")
    .option("--use-interpolation <true|false>", "interpolation mode", "false")
    .option("--use-brand-profile <true|false>", "include active brand profile", "false")
    .addHelpText("after", "\nExamples:\n  sociallab ai video --prompt \"cinematic teaser\" --model sora-2\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/ai/video",
            body: {
              prompt: options.prompt,
              model: options.model,
              aspectRatio: options.aspectRatio,
              resolution: options.resolution,
              imageUrl: options.imageUrl,
              lastFrameUrl: options.lastFrameUrl,
              sceneDuration: options.sceneDuration
                ? Number(options.sceneDuration)
                : undefined,
              generateAudio: options.generateAudio !== "false",
              useInterpolation: options.useInterpolation === "true",
              useBrandProfile: options.useBrandProfile === "true",
            },
          }),
      );
    });

  ai
    .command("flyer")
    .description("Generate a flyer")
    .requiredOption("--data <json|@file>", "request body JSON")
    .addHelpText("after", "\nExamples:\n  sociallab ai flyer --data @flyer.json\n")
    .action(async function action(options: { data: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const data = await readJsonInput<Record<string, unknown>>(options.data);
        return client.request({
          method: "POST",
          path: "/api/ai/flyer",
          body: data,
        });
      });
    });

  ai
    .command("speech")
    .description("Generate speech audio")
    .requiredOption("--text <value>", "speech text")
    .option("--voice <value>", "voice name")
    .addHelpText("after", "\nExamples:\n  sociallab ai speech --text \"Bem-vindo ao torneio\"\n")
    .action(async function action(options: { text: string; voice?: string }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            method: "POST",
            path: "/api/ai/speech",
            body: {
              script: options.text,
              voiceName: options.voice,
            },
          }),
      );
    });

  ai
    .command("enhance")
    .description("Enhance a prompt")
    .requiredOption("--prompt <value>", "prompt text")
    .option("--brand-profile <json|@file>", "brand profile JSON")
    .addHelpText("after", "\nExamples:\n  sociallab ai enhance --prompt \"poster for poker night\"\n")
    .action(async function action(options: Record<string, string | undefined>) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const brandProfile = options.brandProfile
          ? await readJsonInput<Record<string, unknown>>(String(options.brandProfile))
          : undefined;

        return client.request({
          method: "POST",
          path: "/api/ai/enhance-prompt",
          body: {
            prompt: options.prompt,
            brandProfile,
          },
        });
      });
    });

  ai
    .command("extract-colors")
    .description("Extract colors from a logo image")
    .requiredOption("--logo <source>", "logo image source")
    .addHelpText("after", "\nExamples:\n  sociallab ai extract-colors --logo @logo.png\n")
    .action(async function action(options: { logo: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const logo = await sourceToImageReference(options.logo);
        return client.request({
          method: "POST",
          path: "/api/ai/extract-colors",
          body: { logo },
        });
      });
    });

  ai
    .command("image-async")
    .description("Queue one async image generation job")
    .requiredOption("--data <json|@file>", "request body JSON")
    .addHelpText("after", "\nExamples:\n  sociallab ai image-async --data @image-job.json\n")
    .action(async function action(options: { data: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const data = await readJsonInput<Record<string, unknown>>(options.data);
        return client.request({
          method: "POST",
          path: "/api/ai/image/async",
          body: data,
        });
      });
    });

  ai
    .command("image-batch")
    .description("Queue a batch of async image jobs")
    .requiredOption("--data <json|@file>", "request body JSON")
    .addHelpText("after", "\nExamples:\n  sociallab ai image-batch --data @image-batch.json\n")
    .action(async function action(options: { data: string }) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        const data = await readJsonInput<Record<string, unknown>>(options.data);
        return client.request({
          method: "POST",
          path: "/api/ai/image/async/batch",
          body: data,
        });
      });
    });

  ai
    .command("image-job-status")
    .description("Check async image job status")
    .argument("<job-id>", "job id")
    .addHelpText("after", "\nExamples:\n  sociallab ai image-job-status job_123\n")
    .action(async function action(jobId: string) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) => client.request({ path: `/api/ai/image/async/status/${jobId}` }),
      );
    });

  ai
    .command("image-jobs")
    .description("List recent async image jobs")
    .option("--limit <number>", "job limit", parseInteger)
    .addHelpText("after", "\nExamples:\n  sociallab ai image-jobs --limit 25\n")
    .action(async function action(options: { limit?: number }) {
      const command = this as Command;
      await executeCommand(
        command,
        async ({ client }) =>
          client.request({
            path: "/api/ai/image/async/jobs",
            query: {
              limit: options.limit,
            },
          }),
      );
    });

  ai
    .command("image-cancel")
    .description("Cancel an async image job")
    .argument("<job-id>", "job id")
    .addHelpText("after", "\nExamples:\n  sociallab ai image-cancel job_123\n")
    .action(async function action(jobId: string) {
      const command = this as Command;
      await executeCommand(command, async ({ client }) => {
        await client.request({
          method: "DELETE",
          path: `/api/ai/image/async/cancel/${jobId}`,
        });
        return { success: true, jobId };
      });
    });
}
