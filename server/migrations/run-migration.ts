import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { env } from "../lib/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

type MigrationTableRow = {
  table_name: string;
};

async function runMigration(): Promise<void> {
  const sql = neon(env.DATABASE_URL);

  console.log("📦 Executando migration 002_chat_tables_simple.sql...");

  try {
    const migrationSQL = readFileSync(join(__dirname, "002_chat_tables_simple.sql"), "utf8");

    // Dividir em statements individuais
    const allStatements = migrationSQL
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0 && !statement.startsWith("--"));

    // Ordenar: CREATE TABLE primeiro, depois CREATE INDEX, depois COMMENT
    const createTables = allStatements.filter((statement) => statement.startsWith("CREATE TABLE"));
    const createIndexes = allStatements.filter((statement) => statement.startsWith("CREATE INDEX"));
    const comments = allStatements.filter((statement) => statement.startsWith("COMMENT"));

    const statements = [...createTables, ...createIndexes, ...comments];

    console.log(`Executando ${statements.length} statements...`);

    // Executar cada statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt) {
        const preview = stmt.substring(0, 50).replace(/\n/g, " ");
        console.log(`  ${i + 1}/${statements.length}: ${preview}...`);
        await sql.query(stmt);
      }
    }

    console.log("✅ Migration executada com sucesso!");

    // Verificar tabelas criadas
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('chats', 'messages', 'stream_ids')
      ORDER BY table_name
    ` as MigrationTableRow[];

    console.log("✅ Tabelas criadas:");
    tables.forEach((table) => console.log(`   - ${table.table_name}`));

  } catch (error) {
    console.error("❌ Erro na migration:", error);
    process.exit(1);
  }
}

void runMigration();
