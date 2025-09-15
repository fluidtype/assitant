import type OpenAI from 'openai';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

type EnhancedNLUServiceCtor = typeof import('../nlu.service.js').EnhancedNLUService;

let EnhancedNLUService: EnhancedNLUServiceCtor;

const tenant = {
  id: 'tenant-test',
  name: 'Trattoria Test',
  timezone: 'Europe/Rome',
} as Tenant;

const createService = () => new EnhancedNLUService(mockOpenAI as unknown as OpenAI);

describe('EnhancedNLUService', () => {
  beforeAll(async () => {
    ({ EnhancedNLUService } = await import('../nlu.service.js'));
  });

  beforeEach(() => {
    redisStore.clear();
    mockCreate.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses a create booking request with normalized entities', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'CREATE_BOOKING',
              entities: {
                when: { raw: 'domani alle 20', timeISO: '20:00' },
                people: { value: 4 },
                name: { full: 'Rossi' },
              },
              confidence: 0.9,
              missing: [],
              ambiguity: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('Domani alle 20 per 4 a nome Rossi', null, tenant);

    expect(result.intent).toBe('CREATE_BOOKING');
    expect(result.entities.when?.dateISO).toBe('2024-05-11');
    expect(result.entities.when?.timeISO).toBe('20:00');
    expect(result.entities.people?.value).toBe(4);
    expect(result.entities.name?.full).toBe('Rossi');
    expect(result.missing).toEqual([]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.trace?.promptVersion).toBe('nlu:v2');
  });

  it('flags missing booking reference for modify intent', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'MODIFY_BOOKING',
              entities: {
                when: { raw: 'stasera alle 21', timeISO: '21:00' },
              },
              confidence: 0.8,
              missing: [],
              ambiguity: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse(
      'Sposta la mia prenotazione di stasera alle 21',
      null,
      tenant,
    );

    expect(result.intent).toBe('MODIFY_BOOKING');
    expect(result.entities.when?.dateISO).toBe('2024-05-10');
    expect(result.entities.when?.timeISO).toBe('21:00');
    expect(result.missing).toContain('bookingRef');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('parses cancel intent without adding missing fields when name present', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'CANCEL_BOOKING',
              entities: {
                name: { full: 'Marco' },
              },
              confidence: 0.6,
              missing: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('Annulla prenotazione Marco', null, tenant);

    expect(result.intent).toBe('CANCEL_BOOKING');
    expect(result.entities.name?.full).toBe('Marco');
    expect(result.missing).toEqual([]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('parses ask info intent as informational request', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'ASK_INFO',
              entities: {},
              confidence: 0.7,
              missing: [],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('Siete aperti domani?', null, tenant);

    expect(result.intent).toBe('ASK_INFO');
    expect(result.missing).toEqual([]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to UNKNOWN when OpenAI returns invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'non-json-response',
          },
        },
      ],
      model: 'gpt-test',
    });

    const service = createService();
    const result = await service.parse('??', null, tenant);

    expect(result.intent).toBe('UNKNOWN');
    expect(result.confidence).toBe(0.2);
    expect(result.ambiguity).toEqual(['json_parse_error']);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
