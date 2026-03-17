/**
 * Database connection singleton and helpers.
 *
 * Owns: sqlInstance, DATABASE_URL
 * Exports: getSql, warmupDatabase, ensureGallerySourceType, isUndefinedColumnError
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import logger from "./logger.js";

export const DATABASE_URL = process.env.DATABASE_URL;

export type SqlClient = NeonQueryFunction<false, false>;

// SINGLETON: Reuse connection to avoid cold start on every request
let sqlInstance: SqlClient | null = null;

export function getSql(): SqlClient {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not configured");
  }
  if (!sqlInstance) {
    sqlInstance = neon(DATABASE_URL);
  }
  return sqlInstance;
}

// WARMUP: Pre-warm database connection on server start
export async function warmupDatabase(): Promise<void> {
  try {
    const start = Date.now();
    const sql = getSql();
    await sql`SELECT 1 as warmup`;
    logger.info(
      { durationMs: Date.now() - start },
      "Database connection warmed up",
    );
  } catch (error) {
    logger.error({ err: error }, "Database warmup failed");
  }
}

export async function ensureGallerySourceType(sql: SqlClient): Promise<void> {
  try {
    const result = await sql`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'gallery_images' AND column_name = 'source'
      LIMIT 1
    `;

    const column = result?.[0] as { data_type: string; udt_name: string } | undefined;
    if (!column) return;

    const isEnum =
      column.data_type === "USER-DEFINED" && column.udt_name === "image_source";
    if (!isEnum) return;

    logger.info(
      {},
      "[Dev API Server] Migrating gallery_images.source from enum to varchar",
    );
    await sql`ALTER TABLE gallery_images ALTER COLUMN source TYPE VARCHAR(100) USING source::text`;
    await sql`DROP TYPE IF EXISTS image_source`;
    logger.info(
      {},
      "[Dev API Server] gallery_images.source migration complete",
    );
  } catch (error) {
    logger.error(
      { err: error },
      "[Dev API Server] Failed to migrate gallery_images.source",
    );
  }
}

interface DatabaseError {
  message?: string;
  code?: string;
}

export function isUndefinedColumnError(error: unknown, columnName?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const dbError = error as DatabaseError;
  const message = typeof dbError.message === "string" ? dbError.message : "";
  const matchesCode = dbError.code === "42703";
  if (!columnName) {
    return matchesCode || message.includes('does not exist');
  }
  const matchesColumnName =
    message.includes(`column "${columnName}" does not exist`) ||
    message.includes(`column ${columnName} does not exist`);
  return matchesCode && matchesColumnName;
}
