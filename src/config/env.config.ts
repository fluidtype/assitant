import 'dotenv/config';
import { z } from 'zod';

const LogLevel = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const toNumber = (fallback: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? fallback : Number(v)), z.number());

const toOptionalNumber = () =>
  z.preprocess((v) => (v === undefined || v === '' ? undefined : Number(v)), z.number()).optional();

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

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_TEMPERATURE: toOptionalNumber(),

  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),

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
