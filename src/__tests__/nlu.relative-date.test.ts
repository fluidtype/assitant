import type OpenAI from 'openai';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import type { Tenant } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OPENAI_MODEL ??= 'gpt-4o-mini';

const redisStore = new Map<string, string>();

vi.mock('@infra/redis/redis.client.js', () => {
  const redisMock = {
    isOpen: true,
    connect: vi.fn(async () => {
      redisMock.isOpen = true;
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _options?: { EX: number }) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    on: vi.fn(),
  };

  return { redis: redisMock };
});

const mockCreate = vi.fn();
const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
};

type EnhancedNLUServiceCtor = typeof import('@services/ai/nlu.service.js').EnhancedNLUService;

let EnhancedNLUService: EnhancedNLUServiceCtor;

const tenant = {
  id: 'tenant-test',
  name: 'Trattoria Test',
  timezone: 'Europe/Rome',
} as Tenant;

const createService = () => new EnhancedNLUService(mockOpenAI as unknown as OpenAI);

describe('NLU relative dates', () => {
  beforeAll(async () => {
    ({ EnhancedNLUService } = await import('@services/ai/nlu.service.js'));
  });

  beforeEach(() => {
    redisStore.clear();
    mockCreate.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-10T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves "domani" with day granularity and missing time', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'CREATE_BOOKING',
              entities: {
                when: { raw: 'domani' },
                people: { value: 4 },
                name: { full: 'Luca' },
              },
              confidence: 0.8,
              missing: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('domani per 4 a nome Luca', null, tenant);

    const tomorrow = DateTime.now().setZone('Europe/Rome').plus({ days: 1 }).toISODate();
    expect(result.entities.when?.dateISO).toBe(tomorrow);
    expect(result.entities.when?.granularity).toBe('day');
    expect(result.entities.when?.timeISO).toBeUndefined();
    expect(result.missing).toContain('time');
  });

  it('resolves "domani alle 20" with time granularity', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'CREATE_BOOKING',
              entities: {
                when: { raw: 'domani alle 20' },
                people: { value: 4 },
                name: { full: 'Rossi' },
              },
              confidence: 0.85,
              missing: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('domani alle 20 per 4 a nome Rossi', null, tenant);

    const tomorrow = DateTime.now().setZone('Europe/Rome').plus({ days: 1 }).toISODate();
    expect(result.entities.when?.dateISO).toBe(tomorrow);
    expect(result.entities.when?.timeISO).toBe('20:00');
    expect(result.entities.when?.granularity).toBe('time');
    expect(result.missing).not.toContain('time');
  });

  it('resolves "domani sera" as part of day', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'CREATE_BOOKING',
              entities: {
                when: { raw: 'domani sera' },
                people: { value: 2 },
              },
              confidence: 0.85,
              missing: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('domani sera per 2', null, tenant);

    const tomorrow = DateTime.now().setZone('Europe/Rome').plus({ days: 1 }).toISODate();
    expect(result.entities.when?.dateISO).toBe(tomorrow);
    expect(result.entities.when?.granularity).toBe('partOfDay');
    expect(result.entities.when?.timeISO).toBeUndefined();
  });
});
