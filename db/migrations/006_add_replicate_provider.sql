-- Add Replicate as a provider for AI usage tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'ai_provider' AND e.enumlabel = 'replicate'
  ) THEN
    ALTER TYPE ai_provider ADD VALUE 'replicate';
  END IF;
END $$;
