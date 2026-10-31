import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  console.log('[migrate] Connecting to database...');
  const sql = postgres(url, { max: 1 });

  try {
    const possiblePaths = [
      path.resolve(__dirname, 'migrations', '0001_initial_schema.sql'),
      path.resolve(__dirname, '..', 'src', 'migrations', '0001_initial_schema.sql'),
      path.resolve(process.cwd(), 'packages', 'database', 'src', 'migrations', '0001_initial_schema.sql'),
    ];

    const migrationFilePath = possiblePaths.find((p) => fs.existsSync(p));
    if (!migrationFilePath) {
      throw new Error(`Migration file not found in: ${possiblePaths.join(', ')}`);
    }

    console.log(`[migrate] Executing migration: ${path.basename(migrationFilePath)}`);
    const sqlContent = fs.readFileSync(migrationFilePath, 'utf-8');

    // Run the migration script
    await sql.unsafe(sqlContent);
    console.log('[migrate] Migration applied successfully.');
  } finally {
    await sql.end();
  }
}

// Allow direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('[migrate] All migrations finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] Migration failed:', err);
      process.exit(1);
    });
}
