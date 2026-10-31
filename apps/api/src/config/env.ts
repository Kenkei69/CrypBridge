import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from cwd or repository root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '..', '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1000).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgres connection string'),
  SUPABASE_JWT_SECRET: z.string().min(16, 'SUPABASE_JWT_SECRET must be at least 16 characters for security'),
  SUPABASE_URL: z.string().url().optional(),
  SIMULATION_MODE: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('true'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().min(5).max(10000).default(100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let cachedEnv: EnvConfig | null = null;

export function loadConfig(overrides: Record<string, unknown> = {}): EnvConfig {
  const merged = { ...process.env, ...overrides };
  const parsed = EnvSchema.safeParse(merged);

  if (!parsed.success) {
    const errorDetails = JSON.stringify(parsed.error.format(), null, 2);
    console.error('[CONFIG FATAL] Invalid environment configuration:\n', errorDetails);
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getConfig(): EnvConfig {
  if (!cachedEnv) {
    return loadConfig();
  }
  return cachedEnv;
}
