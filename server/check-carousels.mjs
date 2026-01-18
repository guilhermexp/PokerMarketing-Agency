import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

try {
  const carousels = await sql`
    SELECT id, campaign_id, title, cover_url, cover_prompt
    FROM carousel_scripts
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('Carousels:', JSON.stringify(carousels, null, 2));

  // Check campaigns with carousels
  const campaigns = await sql`
    SELECT c.id, c.name,
      (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id LIMIT 1) as cover_url
    FROM campaigns c
    WHERE EXISTS (SELECT 1 FROM carousel_scripts WHERE campaign_id = c.id)
    ORDER BY c.created_at DESC
    LIMIT 5
  `;
  console.log('\nCampaigns with carousels:', JSON.stringify(campaigns, null, 2));
} catch (err) {
  console.error('Error:', err);
} finally {
  await sql.end();
}
