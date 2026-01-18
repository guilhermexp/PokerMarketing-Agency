import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function fixCarouselPreviews() {
  try {
    console.log('🔍 Verificando estrutura da tabela gallery_images...');

    // Check if carousel_script_id column exists
    const columns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'gallery_images'
        AND column_name = 'carousel_script_id'
    `;

    if (columns.length === 0) {
      console.log('❌ Coluna carousel_script_id não existe. Criando...');
      await sql`
        ALTER TABLE gallery_images
        ADD COLUMN carousel_script_id UUID REFERENCES carousel_scripts(id) ON DELETE CASCADE
      `;
      console.log('✅ Coluna carousel_script_id criada!');
    } else {
      console.log('✅ Coluna carousel_script_id já existe');
    }

    // Now update all carousel_scripts to set cover_url from first gallery image
    console.log('\n🔄 Atualizando cover_url dos carrosséis existentes...');

    const result = await sql`
      UPDATE carousel_scripts cs
      SET cover_url = gi.src_url
      FROM gallery_images gi
      WHERE gi.carousel_script_id = cs.id
        AND cs.cover_url IS NULL
        AND gi.src_url IS NOT NULL
        AND gi.src_url NOT LIKE 'data:%'
        AND gi.id = (
          SELECT id FROM gallery_images
          WHERE carousel_script_id = cs.id
            AND src_url IS NOT NULL
            AND src_url NOT LIKE 'data:%'
          ORDER BY created_at ASC
          LIMIT 1
        )
    `;

    console.log(`✅ ${result.count} carrosséis atualizados com cover_url`);

    // Show summary
    console.log('\n📊 Resumo:');
    const carouselsWithCover = await sql`
      SELECT COUNT(*) as count
      FROM carousel_scripts
      WHERE cover_url IS NOT NULL
    `;

    const carouselsWithoutCover = await sql`
      SELECT COUNT(*) as count
      FROM carousel_scripts
      WHERE cover_url IS NULL
    `;

    console.log(`   Carrosséis COM cover_url: ${carouselsWithCover[0].count}`);
    console.log(`   Carrosséis SEM cover_url: ${carouselsWithoutCover[0].count}`);

  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await sql.end();
  }
}

fixCarouselPreviews();
