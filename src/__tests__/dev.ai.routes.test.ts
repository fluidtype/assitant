import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseWithContextMock, processMessageMock, tenantFindUniqueMock } = vi.hoisted(() => ({
  parseWithContextMock: vi.fn(),
  processMessageMock: vi.fn(),
  tenantFindUniqueMock: vi
    .fn()
    .mockResolvedValue({ id: 'demo-tenant-aurora', name: 'Demo tenant' }),
}));

vi.mock('@services/ai/nlu.service.js', () => ({
  EnhancedNLUService: vi.fn().mockImplementation(() => ({
    parseWithContext: parseWithContextMock,
  })),
}));

vi.mock('@services/conversation/conversation.service.js', () => ({
  ConversationService: vi.fn().mockImplementation(() => ({
    processMessage: processMessageMock,
  })),
}));

vi.mock('@infra/database/prisma.client.js', () => ({
  prisma: {
    tenant: {
      findUnique: tenantFindUniqueMock,
    },
  },
}));

vi.mock('@config/env.config', () => ({
  config: {
    OPENAI_MODEL: 'test-model',
    OPENAI_TEMPERATURE: 0.2,
    TIMEZONE: 'Europe/Rome',
  },
}));

import { buildTestApp } from '@test/utils/buildTestApp.js';

import devAiRoutes from '@api/routes/dev.ai.routes.js';

describe('POST /v1/dev/ai/respond', () => {
  beforeEach(() => {
    parseWithContextMock.mockReset();
    processMessageMock.mockReset();
    tenantFindUniqueMock.mockReset();
    tenantFindUniqueMock.mockResolvedValue({ id: 'demo-tenant-aurora', name: 'Demo tenant' });
    parseWithContextMock.mockResolvedValue({
      intent: 'CREATE_BOOKING',
      confidence: 0.9,
      entities: {},
      missing: [],
      ambiguity: [],
      warnings: [],
    });
    processMessageMock.mockResolvedValue({ replyText: 'ok' });
  });

  it('returns intent payload and conversation reply', async () => {
    const app = buildTestApp(devAiRoutes);
    const res = await request(app)
      .post('/v1/dev/ai/respond')
      .send({ tenantId: 'demo-tenant-aurora', userPhone: '+390000000001', text: 'ciao' })
      .expect(200);

    expect(res.body.intent).toEqual({
      intent: 'CREATE_BOOKING',
      confidence: 0.9,
      entities: {},
      missing: [],
      ambiguity: [],
      warnings: [],
    });
    expect(res.body.reply).toEqual({ replyText: 'ok' });
    expect(parseWithContextMock).toHaveBeenCalledWith('ciao', null, expect.anything());
    expect(processMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'demo-tenant-aurora',
        userPhone: '+390000000001',
        message: 'ciao',
      }),
      expect.objectContaining({ intent: 'CREATE_BOOKING' }),
    );
  });
});
