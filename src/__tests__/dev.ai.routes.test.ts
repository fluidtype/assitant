import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from '@test/utils/buildTestApp.js';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('dev AI routes', () => {
  let app: ReturnType<typeof buildTestApp> | null = null;

  beforeAll(async () => {
    const { default: devAiRoutes } = await import('@api/routes/dev.ai.routes.js');
    app = buildTestApp(devAiRoutes);
  });

  it('responds to POST /dev/ai/respond', async () => {
    const response = await request(app!).post('/v1/dev/ai/respond').send({
      tenantId: 'tenant-test',
      userPhone: '+390000000000',
      text: 'ciao',
    });

    expect(response.status).toBe(200);
    expect(response.body.replyText).toBe('echo: ciao');
  });
});
