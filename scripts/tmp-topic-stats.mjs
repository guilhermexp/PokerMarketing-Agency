import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const topic = '1c6d1394-70e2-48d7-ab1c-a4d1f03d5527';

const [stats] = await sql`
  SELECT
    COUNT(DISTINCT b.id) AS batches,
    COUNT(g.id) AS generations,
    MAX(octet_length(COALESCE(g.asset::text, ''))) AS max_asset_bytes,
    AVG(octet_length(COALESCE(g.asset::text, '')))::bigint AS avg_asset_bytes,
    MAX(octet_length(COALESCE(b.prompt, ''))) AS max_prompt_bytes,
    AVG(octet_length(COALESCE(b.prompt, '')))::bigint AS avg_prompt_bytes
  FROM image_generation_batches b
  LEFT JOIN image_generations g ON g.batch_id = b.id
  WHERE b.topic_id = ${topic}
`;

console.log(stats);
