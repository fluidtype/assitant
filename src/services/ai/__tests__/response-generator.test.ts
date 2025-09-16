import type OpenAI from 'openai';
import { DateTime } from 'luxon';
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

  it('localizes missing date quick replies based on tenant locale', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'still-not-json',
          },
        },
      ],
      model: 'gpt-test',
    });

    const generator = new ResponseGenerator(mockOpenAI as unknown as OpenAI);
    const englishTenant = {
      ...tenant,
      config: { ...(tenant.config as Record<string, unknown>), locale: 'en-US' },
    } as unknown as Tenant;

    const result = await generator.generate({
      tenant: englishTenant,
      intent: 'CREATE_BOOKING',
      entities: {},
      missing: ['when'],
      context: { state: 'COLLECTING_DETAILS' },
    });

    expect(result.quick_replies).toEqual(['Tonight', 'Tomorrow', 'See more times']);
  });

  it('resolves start and end ISO from proposal with part-of-day fallback', () => {
    const generator = new ResponseGenerator(mockOpenAI as unknown as OpenAI);
    const proposal = {
      tenantId: tenant.id,
      name: 'Rossi',
      people: 2,
      dateISO: '2025-09-20',
      partOfDay: 'evening',
    } as any;

    const startISO = generator.resolveStartISOFromProposal(proposal, tenant);
    const endISO = generator.resolveEndISOFromProposal(proposal, tenant);

    const start = DateTime.fromISO(startISO, { zone: tenant.timezone });
    const end = DateTime.fromISO(endISO, { zone: tenant.timezone });

    expect(start.toISODate()).toBe('2025-09-20');
    expect(start.hour).toBe(20);
    expect(end.diff(start, 'minutes').minutes).toBe(120);
  });

  it('builds localized missing message', async () => {
    const generator = new ResponseGenerator(mockOpenAI as unknown as OpenAI);
    const message = await generator.askForMissing(tenant, ['name', 'people']);
    expect(message).toContain('Mi servono ancora');
    expect(message.toLowerCase()).toContain('nome');
  });
});
