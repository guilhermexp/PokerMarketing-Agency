/**
 * Type declarations for .mjs files that haven't been migrated to TypeScript yet.
 * These will be removed as files are migrated in Batch 9 and 10.
 */

// Job queue helper
declare module "*/helpers/job-queue.mjs" {
  export function schedulePostForPublishing(
    postId: string,
    userId: string,
    timestampMs: number
  ): Promise<void>;

  export function cancelScheduledPost(postId: string): Promise<void>;
}
