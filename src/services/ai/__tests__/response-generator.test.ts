import type OpenAI from 'openai';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tenant } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OPENAI_MODEL ??= 'gpt-4o-mini';

const mockCreate = vi.fn();

const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
};

type ResponseGeneratorCtor = typeof import('../response-generator.service.js').ResponseGenerator;

let ResponseGenerator: ResponseGeneratorCtor;

const tenant = {
  id: 'demo-tenant-aurora',
  name: 'Trattoria Demo',
  timezone: 'Europe/Rome',
  config: {
    openingHours: {
      monday: { open: '18:00', close: '23:00' },
    },
    capacity: 80,
    rules: ['Accogliamo gruppi fino a 8 persone.'],
  },
} as unknown as Tenant;

describe('ResponseGenerator', () => {
  beforeAll(async () => {
    ({ ResponseGenerator } = await import('../response-generator.service.js'));
  });

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns parsed reply when OpenAI responds with valid JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              text: 'Prenotato ✅ Ti aspetto domani alle 20:00.',
              quick_replies: ['Vedi altri orari'],
            }),
          },
        },
      ],
      model: 'gpt-test',
    });

    const generator = new ResponseGenerator(mockOpenAI as unknown as OpenAI);
    const result = await generator.generate({
      tenant,
      intent: 'CREATE_BOOKING',
      entities: {
        when: { dateISO: '2025-09-20', timeISO: '20:00' },
        people: { value: 4 },
      },
      missing: [],
      context: { state: 'IDLE' },
    });

    expect(result.text).toBe('Prenotato ✅ Ti aspetto domani alle 20:00.');
    expect(result.quick_replies).toEqual(['Vedi altri orari']);
    expect(result.quick_replies?.length).toBeLessThanOrEqual(3);
    expect(result.trace?.promptVersion).toBe('resp:v1');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to clarification message when OpenAI returns malformed payload', async () => {
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

    const generator = new ResponseGenerator(mockOpenAI as unknown as OpenAI);
    const result = await generator.generate({
      tenant,
      intent: 'CREATE_BOOKING',
      entities: {},
      missing: ['time'],
      context: { state: 'CREATING_BOOKING' },
    });

    expect(result.text).toBe('Scusa, puoi confermarmi i dettagli mancanti?');
    expect(result.quick_replies).toEqual(['19:30', '20:00', '20:30']);
    expect(result.quick_replies?.length ?? 0).toBeLessThanOrEqual(3);
    expect(result.trace?.fallback).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
