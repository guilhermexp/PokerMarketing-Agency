import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

async function runMigration() {
  const sql = neon(process.env.DATABASE_URL);

  console.log('📦 Executando migration 002_chat_tables_simple.sql...');

  try {
    const migrationSQL = readFileSync(join(__dirname, '002_chat_tables_simple.sql'), 'utf8');

    // Dividir em statements individuais
    const allStatements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    // Ordenar: CREATE TABLE primeiro, depois CREATE INDEX, depois COMMENT
    const createTables = allStatements.filter(s => s.startsWith('CREATE TABLE'));
    const createIndexes = allStatements.filter(s => s.startsWith('CREATE INDEX'));
    const comments = allStatements.filter(s => s.startsWith('COMMENT'));

    const statements = [...createTables, ...createIndexes, ...comments];

    console.log(`Executando ${statements.length} statements...`);

    // Executar cada statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt) {
        const preview = stmt.substring(0, 50).replace(/\n/g, ' ');
        console.log(`  ${i + 1}/${statements.length}: ${preview}...`);
        await sql.query(stmt);
      }
    }

    console.log('✅ Migration executada com sucesso!');

    // Verificar tabelas criadas
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('chats', 'messages', 'stream_ids')
      ORDER BY table_name
    `;

    console.log('✅ Tabelas criadas:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));

  } catch (error) {
    console.error('❌ Erro na migration:', error);
    process.exit(1);
  }
}

runMigration();
