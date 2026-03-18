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
  // Required
  DATABASE_URL: requiredEnv,
  BETTER_AUTH_SECRET: requiredEnv,
  CSRF_SECRET: process.env.NODE_ENV === "production" ? requiredEnv : optionalEnv,
  GEMINI_API_KEY: requiredEnv,

  // Optional storage/AI providers
  REDIS_URL: optionalEnv,
  BLOB_READ_WRITE_TOKEN: optionalEnv,
  REPLICATE_API_TOKEN: optionalEnv,
  FAL_KEY: optionalEnv,
  IMAGE_PROVIDERS: optionalEnv,

  // Optional Upstash (rate limiting)
  UPSTASH_REDIS_REST_URL: optionalEnv,
  UPSTASH_REDIS_REST_TOKEN: optionalEnv,

  // Optional internal API auth
  INTERNAL_API_TOKEN: optionalEnv,
  INTERNAL_API_BASE_URL: optionalEnv,

  // Optional integrations
  RUBE_TOKEN: optionalEnv,
  ANTHROPIC_AUTH_TOKEN: optionalEnv,

  // Optional config
  CORS_ORIGINS: optionalEnv,
  APP_URL: optionalEnv,
  BASE_URL: optionalEnv,
  SUPER_ADMIN_EMAILS: optionalEnv,
  LOG_LEVEL: optionalEnv,
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
