import OpenAI from 'openai';

import type { ConversationState } from '@services/cache/conversation-cache.js';

import type { TenantEntity } from '@core/entities/tenant.entity.js';
import type { IntentResult } from '@core/interfaces/index.js';

import { config } from '@config/env.config';

import { PromptBuilder } from './prompt.builder.js';

export class EnhancedNLUService {
  constructor(
    private readonly openai: OpenAI = new OpenAI({ apiKey: config.OPENAI_API_KEY }),
    private readonly promptBuilder: PromptBuilder = new PromptBuilder(),
  ) {}

  async parseWithContext(
    message: string,
    state: ConversationState | null,
    tenant: TenantEntity & { config?: Record<string, unknown>; features?: Record<string, unknown> },
  ): Promise<IntentResult> {
    try {
      const prompt = this.promptBuilder.buildPrompt({
        message,
        state,
        tenant,
        timezone: config.TIMEZONE,
      });
      const completion = await this.openai.chat.completions.create(
        {
          model: config.OPENAI_MODEL,
          temperature: config.OPENAI_TEMPERATURE,
          messages: [{ role: 'user', content: prompt }],
        },
        { timeout: 20000 },
      );

      const raw = completion.choices?.[0]?.message?.content ?? '';
      const text = raw.trim().replace(/^```(?:json)?|```$/g, '');
      const parsed = JSON.parse(text);

      const allowed = ['create', 'modify', 'cancel', 'get_info', 'confirmation', 'unknown'];
      let intent = typeof parsed.intent === 'string' ? parsed.intent : 'unknown';
      if (!allowed.includes(intent)) intent = 'unknown';

      let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      if (confidence < 0 || confidence > 1) confidence = 0;

      const result: IntentResult = { intent, confidence } as IntentResult;
      if (parsed.slots && typeof parsed.slots === 'object') {
        (result as any).slots = parsed.slots;
      }
      if (Array.isArray(parsed.warnings)) {
        (result as any).warnings = parsed.warnings;
      }
      return result;
    } catch {
      return { intent: 'unknown', confidence: 0, warnings: ['nlu_fallback'] } as IntentResult;
    }
  }
}
