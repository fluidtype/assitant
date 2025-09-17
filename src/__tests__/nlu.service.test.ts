import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/env.config', () => ({
  config: {
    OPENAI_MODEL: 'test-model',
    OPENAI_TEMPERATURE: 0.2,
    TIMEZONE: 'Europe/Rome',
  },
}));

import { EnhancedNLUService } from '@services/ai/nlu.service.js';
import { PromptBuilder } from '@services/ai/prompt.builder.js';

function createService(response: unknown) {
  const openai = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: typeof response === 'string' ? response : JSON.stringify(response),
              },
            },
          ],
        }),
      },
    },
  };

  const service = new EnhancedNLUService(openai as any, new PromptBuilder());
  return { service, openai };
}

const tenant = {
  id: 'tenant-1',
  name: 'Demo tenant',
  config: {},
  features: {},
} as any;

describe('EnhancedNLUService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalises OpenAI payload to IntentResult v2 schema', async () => {
    const payload = {
      intent: 'create',
      confidence: 0.91,
      entities: {
        name: { value: 'Rossi' },
        notes: 'ciao',
        when: {
          value: { startAt: '2025-09-18T20:00:00+02:00', endAt: '2025-09-18T21:00:00+02:00' },
        },
      },
      missing: ['people', { field: 'when' }, 42],
      ambiguity: ['name', { field: 'people', options: [{ value: 4 }, 'wrong'] }],
      warnings: ['low_confidence', 10],
    };

    const { service } = createService(payload);
    const result = await service.parseWithContext('ciao', null, tenant);

    expect(result.intent).toBe('CREATE_BOOKING');
    expect(result.confidence).toBe(0.91);
    expect(result.entities.name?.value).toBe('Rossi');
    expect(result.entities.notes?.value).toBe('ciao');
    expect(result.entities.when?.value).toEqual({
      startAt: '2025-09-18T20:00:00+02:00',
      endAt: '2025-09-18T21:00:00+02:00',
    });
    expect(result.missing).toEqual(['people', 'when']);
    expect(result.ambiguity).toEqual([
      { field: 'name' },
      { field: 'people', options: [{ value: 4 }] },
    ]);
    expect(result.warnings).toEqual(['low_confidence']);
  });

  it('falls back to UNKNOWN intent on invalid payload', async () => {
    const { service } = createService('not-json');
    const result = await service.parseWithContext('ciao', null, tenant);
    expect(result).toEqual({
      intent: 'UNKNOWN',
      confidence: 0,
      entities: {},
      missing: [],
      ambiguity: [],
      warnings: ['nlu_fallback'],
    });
  });
});
