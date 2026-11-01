import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
  const sql = postgres(url, { max: 1, ...(process.env.DATABASE_PASSWORD ? { password: process.env.DATABASE_PASSWORD } : {}) });

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

    await sql`SELECT pg_advisory_lock(4026001)`;
    try {
      await sql`CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
        const checksum = createHash('sha256').update(content).digest('hex');
        const [existing] = await sql`SELECT checksum FROM app_migrations WHERE name = ${file}`;
        if (existing) {
          if (existing.checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
          continue;
        }
        await sql.begin(async tx => {
          await tx.unsafe(content);
          await tx`INSERT INTO app_migrations (name, checksum) VALUES (${file}, ${checksum})`;
        });
        console.log(`[migrate] Applied ${file}`);
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(4026001)`;
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
