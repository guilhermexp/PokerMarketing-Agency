/**
 * Migration script to execute schema on Neon database
 * Uses sql.transaction() for proper DDL persistence with pooler
 * Run with: DATABASE_URL=... node db/migrate.mjs
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Parse SQL file into individual statements
function parseSQL(sqlContent) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sqlContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('--')) {
      continue;
    }

    current += line + '\n';

    // Check for $$ or $tag$ dollar quoting (used in functions)
    const dollarMatches = line.match(/\$[a-zA-Z]*\$/g);
    if (dollarMatches) {
      for (const match of dollarMatches) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = match;
        } else if (match === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
        }
      }
    }

    // If line ends with semicolon and we're not in a dollar quote, end statement
    if (trimmed.endsWith(';') && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  // Add any remaining content
  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function migrate() {
  console.log('🔗 Connecting to Neon database...\n');
  const sql = neon(DATABASE_URL);

  // Read schema file
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  const statements = parseSQL(schema);
  console.log(`📋 Found ${statements.length} SQL statements\n`);

  let executed = 0;
  let skipped = 0;
  let errors = 0;

  // Execute each statement using transaction to ensure persistence
  for (const stmt of statements) {
    const firstLine = stmt.split('\n')[0].substring(0, 55);
    const isImportant = stmt.toUpperCase().startsWith('CREATE') ||
                       stmt.toUpperCase().startsWith('ALTER');

    try {
      // Use transaction with a single statement to ensure it commits
      await sql.transaction([
        sql`${sql.unsafe(stmt)}`
      ]);

      executed++;
      if (isImportant) {
        console.log(`✅ ${firstLine}...`);
      }
    } catch (err) {
      const msg = err.message || '';

      if (msg.includes('already exists')) {
        skipped++;
        console.log(`⏭️  ${firstLine}... (already exists)`);
      } else if (msg.includes('does not exist') && !stmt.includes('DROP')) {
        skipped++;
        console.log(`⏭️  ${firstLine}... (does not exist)`);
      } else if (msg.includes('duplicate')) {
        skipped++;
        console.log(`⏭️  ${firstLine}... (duplicate)`);
      } else {
        errors++;
        console.log(`❌ ${firstLine}...`);
        console.log(`   Error: ${msg}\n`);
      }
    }
  }

  console.log('\n📊 Migration Summary');
  console.log('─'.repeat(40));
  console.log(`  Executed: ${executed}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);

  // Verify tables
  console.log('\n📦 Tables in Database');
  console.log('─'.repeat(40));

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  if (tables.length === 0) {
    console.log('  No tables found');
  } else {
    for (const t of tables) {
      console.log(`  • ${t.table_name}`);
    }
  }

  // Verify types
  console.log('\n🏷️  Custom Types');
  console.log('─'.repeat(40));

  const types = await sql`
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typtype = 'e'
    ORDER BY t.typname
  `;

  if (types.length === 0) {
    console.log('  No custom types found');
  } else {
    for (const t of types) {
      console.log(`  • ${t.typname}`);
    }
  }

  console.log('\n✨ Migration complete!\n');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
