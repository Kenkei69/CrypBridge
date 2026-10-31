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
    const possibleDirs = [
      path.resolve(__dirname, 'migrations'),
      path.resolve(__dirname, '..', 'src', 'migrations'),
      path.resolve(process.cwd(), 'packages', 'database', 'src', 'migrations'),
    ];

    const migrationDir = possibleDirs.find((dir) => fs.existsSync(dir));
    if (!migrationDir) {
      throw new Error(`Migration directory not found in: ${possibleDirs.join(', ')}`);
    }

    const files = fs
      .readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`[migrate] Found ${files.length} migration file(s) in ${migrationDir}: ${files.join(', ')}`);

    for (const file of files) {
      const fullPath = path.join(migrationDir, file);
      console.log(`[migrate] Executing migration: ${file}`);
      const sqlContent = fs.readFileSync(fullPath, 'utf-8');
      await sql.unsafe(sqlContent);
      console.log(`[migrate] Migration ${file} applied successfully.`);
    }

    console.log('[migrate] All migrations applied successfully.');
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
