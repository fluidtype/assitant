process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/testdb';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.OPENAI_MODEL ??= 'test-model';
process.env.OPENAI_TEMPERATURE ??= '0.2';
process.env.TIMEZONE ??= 'Europe/Rome';
