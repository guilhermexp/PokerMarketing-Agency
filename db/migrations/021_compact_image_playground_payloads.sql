-- Migration: Compact oversized Image Playground payloads
-- Created: 2026-02-06
-- Description:
--   1) Remove heavy/base64-oriented keys from historical image_generation_batches.config
--   2) Compact image_async_tasks.metadata.params for completed tasks
--
-- Safety:
--   - Idempotent: can be executed multiple times
--   - Does not remove generation assets (image URL records)
--   - Keeps prompt/model/provider/aspectRatio/imageSize and other lightweight config fields

BEGIN;

-- 1) Compact batch config payloads used by Image Playground history.
UPDATE image_generation_batches
SET config = (COALESCE(config, '{}'::jsonb) - 'referenceImages' - 'productImages' - 'imageUrl')
WHERE config IS NOT NULL
  AND (
    config ? 'referenceImages'
    OR config ? 'productImages'
    OR config ? 'imageUrl'
  );

-- 2) Compact async task metadata for completed tasks only.
--    These keys are not required after task completion and can be very large.
UPDATE image_async_tasks
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{params}',
  (
    COALESCE(metadata->'params', '{}'::jsonb)
    - 'referenceImages'
    - 'productImages'
    - 'imageUrl'
    - 'brandProfile'
  ),
  true
)
WHERE metadata IS NOT NULL
  AND status IN ('success', 'error')
  AND metadata ? 'params'
  AND (
    (metadata->'params') ? 'referenceImages'
    OR (metadata->'params') ? 'productImages'
    OR (metadata->'params') ? 'imageUrl'
    OR (metadata->'params') ? 'brandProfile'
  );

COMMIT;

-- Optional post-step (run manually, outside transaction, during low traffic):
-- VACUUM (ANALYZE) image_generation_batches;
-- VACUUM (ANALYZE) image_async_tasks;
