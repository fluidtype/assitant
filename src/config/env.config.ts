import 'dotenv/config';
import { z } from 'zod';

const LogLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const toNumber = (fallback: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? fallback : Number(v)), z.number());

const toBool = (fallback: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase().trim();
    return ['1', 'true', 'yes', 'y', 'on'].includes(s);
  }, z.boolean());

export const ConfigSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: toNumber(3000),
  LOG_LEVEL: LogLevel.default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_TTL: toNumber(1800),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TEMPERATURE: toNumber(0.3),

  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_VERIFY_TOKEN is required'),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(1, 'WHATSAPP_WEBHOOK_SECRET is required'),

  TIMEZONE: z.string().default('Europe/Rome'),

  QUEUE_CONCURRENCY: toNumber(5),
  QUEUE_MAX_ATTEMPTS: toNumber(3),

  ENABLE_CALENDAR: toBool(false),
  ENABLE_ANALYTICS: toBool(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadEnv(): Readonly<AppConfig> {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
    const message = [
      'Invalid environment configuration:',
      issues,
      'Update your .env or environment variables and try again.',
    ].join('\n');
    throw new Error(message);
  }
  return Object.freeze(parsed.data);
}

export const config: Readonly<AppConfig> = loadEnv();
