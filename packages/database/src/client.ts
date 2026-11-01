import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export type DatabaseInstance = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString?: string) {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required to connect to the database');
  }

  const client = postgres(url, {
    ...(process.env.DATABASE_PASSWORD ? { password: process.env.DATABASE_PASSWORD } : {}),
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  return {
    db,
    sql: client,
    close: async () => {
      await client.end();
    },
  };
}
