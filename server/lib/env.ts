import { z } from "zod";

const requiredEnv = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1, "is required"),
);

const optionalEnv = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  },
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  DATABASE_URL: requiredEnv,
  BETTER_AUTH_SECRET: requiredEnv,
  CSRF_SECRET: requiredEnv,
  GEMINI_API_KEY: requiredEnv,
  REDIS_URL: optionalEnv,
  BLOB_READ_WRITE_TOKEN: optionalEnv,
  REPLICATE_API_TOKEN: optionalEnv,
  FAL_KEY: optionalEnv,
  IMAGE_PROVIDERS: optionalEnv,
  SUPER_ADMIN_EMAILS: optionalEnv,
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function validateEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export const env = validateEnv();
