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
  SUPABASE_JWT_SECRET: z.string().min(16).optional(),
  ALLOW_HOSTED_SIMULATION: z.enum(['true', 'false']).default('false'),
  SIMULATION_SIGNER_SECRET: z.string().min(32).optional(),
  GUARDIAN_SIGNER_PERMIT_SECRET: z.string().min(32).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SIMULATION_MODE: z.enum(['true', 'false', '1', '0']).default('true')
    .transform((val) => val === 'true' || val === '1'),
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

  const production = parsed.data.APP_ENV === 'production' || parsed.data.NODE_ENV === 'production';
  if (production) {
    if (parsed.data.APP_ENV !== 'production' || !parsed.data.SUPABASE_URL?.startsWith('https://')) {
      throw new Error('Production requires APP_ENV=production and an HTTPS SUPABASE_URL');
    }
    if (!parsed.data.SIMULATION_MODE || parsed.data.ALLOW_HOSTED_SIMULATION !== 'true') {
      throw new Error('Only explicitly enabled hosted simulation is supported');
    }
    if (!parsed.data.SIMULATION_SIGNER_SECRET || !parsed.data.GUARDIAN_SIGNER_PERMIT_SECRET ||
        parsed.data.SIMULATION_SIGNER_SECRET.includes('REPLACE_') || parsed.data.GUARDIAN_SIGNER_PERMIT_SECRET.includes('REPLACE_') ||
        parsed.data.SIMULATION_SIGNER_SECRET === parsed.data.GUARDIAN_SIGNER_PERMIT_SECRET) {
      throw new Error('Production requires separate simulation and Guardian secrets (32+ characters)');
    }
    if (parsed.data.ALLOWED_ORIGINS.some(origin => !origin.startsWith('https://') || origin.includes('*'))) {
      throw new Error('Production requires exact HTTPS ALLOWED_ORIGINS');
    }
  } else if (!parsed.data.SUPABASE_JWT_SECRET) {
    throw new Error('Development requires SUPABASE_JWT_SECRET');
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
