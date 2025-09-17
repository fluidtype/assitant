import type { Request, Response, NextFunction, Router } from 'express';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

import type { IntentResult } from '@core/interfaces/index.js';

const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';

const configMock = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  REDIS_TTL: 1800,
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'gpt-test',
  OPENAI_TEMPERATURE: 0,
  WHATSAPP_VERIFY_TOKEN: undefined,
  WHATSAPP_PHONE_NUMBER_ID: undefined,
  WHATSAPP_ACCESS_TOKEN: undefined,
  WHATSAPP_APP_SECRET: undefined,
  TIMEZONE: 'Europe/Rome',
  QUEUE_CONCURRENCY: 5,
  QUEUE_MAX_ATTEMPTS: 3,
  ENABLE_CALENDAR: false,
  ENABLE_ANALYTICS: false,
} as const;

vi.mock('@config/env.config', () => ({ config: configMock }));

const openAiCreateMock = vi.fn();
const openAiMock = {
  chat: {
    completions: {
      create: openAiCreateMock,
    },
  },
};

vi.mock('@infra/openai/openai.client.js', () => ({
  getOpenAI: () => openAiMock,
}));

const findUniqueMock = vi.fn();

vi.mock('@infra/database/prisma.client.js', () => ({
  prisma: {
    tenant: {
      findUnique: findUniqueMock,
    },
  },
}));

const tenantMock = {
  id: 'tenant-1',
  name: 'Test Tenant',
  config: {},
  features: {},
};

const buildPromptMock = vi.fn(() => 'PROMPT');

let EnhancedNLUService: typeof import('@services/ai/nlu.service.js').EnhancedNLUService;
let devNluRouter: Router;

beforeAll(async () => {
  ({ EnhancedNLUService } = await import('@services/ai/nlu.service.js'));
  ({ default: devNluRouter } = await import('@api/routes/dev.nlu.routes.js'));
});

const getParseHandler = () => {
  const stack = (devNluRouter as unknown as { stack: any[] }).stack;
  const layer = stack.find(
    (entry) => entry?.route?.path === '/dev/nlu/parse' && Boolean(entry?.route?.methods?.get),
  );
  if (!layer) throw new Error('Parse route not found');
  return layer.route.stack[0].handle as (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void>;
};

describe('EnhancedNLUService', () => {
  beforeEach(() => {
    openAiCreateMock.mockReset();
    buildPromptMock.mockClear();
  });

  it('normalizes OpenAI payloads to schema v2', async () => {
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              '```json{"intent":"create booking","confidence":0.85,"entities":{"people":2},"missing":[" data ",""],"ambiguity":["orario",null],"warnings":["check",42]}```',
          },
        },
      ],
    });

    const service = new EnhancedNLUService(
      openAiMock as any,
      { buildPrompt: buildPromptMock } as any,
    );
    const result = await service.parseWithContext('ciao', null, tenantMock as any);

    const expected: IntentResult = {
      intent: 'CREATE_BOOKING',
      confidence: 0.85,
      entities: { people: 2 },
      missing: ['data'],
      ambiguity: ['orario'],
      warnings: ['check'],
    };
    expect(result).toEqual(expected);
    expect(buildPromptMock).toHaveBeenCalledOnce();
    expect(openAiCreateMock).toHaveBeenCalledOnce();
  });

  it('returns fallback payload on errors', async () => {
    openAiCreateMock.mockRejectedValue(new Error('boom'));

    const service = new EnhancedNLUService(
      openAiMock as any,
      { buildPrompt: buildPromptMock } as any,
    );
    const result = await service.parseWithContext('ciao', null, tenantMock as any);

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

describe('GET /v1/dev/nlu/parse', () => {
  beforeEach(() => {
    openAiCreateMock.mockReset();
    findUniqueMock.mockReset();
  });

  it('exposes responses normalized to schema v2', async () => {
    findUniqueMock.mockResolvedValue(tenantMock);
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"intent":"modify","confidence":1.2,"entities":{"people":4},"warnings":[]}',
          },
        },
      ],
    });

    const handler = getParseHandler();
    const req = { query: { tenantId: tenantMock.id, text: 'ciao' } };
    const res = createMockResponse();
    const next = vi.fn();

    await handler(req as unknown as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      intent: 'MODIFY_BOOKING',
      confidence: 1,
      entities: { people: 4 },
      missing: [],
      ambiguity: [],
      warnings: [],
    });
  });
});

function createMockResponse() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.payload = data;
      return this;
    },
  };
}

afterAll(() => {
  process.env.NODE_ENV = originalEnv;
});
