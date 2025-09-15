import OpenAI from 'openai';

import { config } from '@config/env.config';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return client;
}
