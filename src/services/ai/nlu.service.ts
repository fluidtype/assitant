import OpenAI from 'openai';

import type { ConversationState } from '@services/cache/conversation-cache.js';

import type { TenantEntity } from '@core/entities/tenant.entity.js';
import type { IntentName, IntentResult } from '@core/interfaces/index.js';
import { INTENT_NAMES } from '@core/interfaces/index.js';

import { getOpenAI } from '@infra/openai/openai.client.js';

import { config } from '@config/env.config';

import { PromptBuilder } from './prompt.builder.js';

const INTENT_SET = new Set<IntentName>(INTENT_NAMES);

const LEGACY_INTENT_MAP: Record<string, IntentName> = {
  CREATE: 'CREATE_BOOKING',
  CREATE_BOOKING: 'CREATE_BOOKING',
  CANCEL: 'CANCEL_BOOKING',
  CANCEL_BOOKING: 'CANCEL_BOOKING',
  MODIFY: 'MODIFY_BOOKING',
  MODIFY_BOOKING: 'MODIFY_BOOKING',
  UPDATE_BOOKING: 'MODIFY_BOOKING',
  GET_INFO: 'GET_INFORMATION',
  GET_INFORMATION: 'GET_INFORMATION',
  INFO: 'GET_INFORMATION',
  CONFIRMATION: 'CONFIRMATION',
  CONFIRM: 'CONFIRMATION',
  UNKNOWN: 'UNKNOWN',
};

const normalizeIntent = (value: unknown): IntentName => {
  if (typeof value !== 'string') return 'UNKNOWN';
  const normalized = value
    .trim()
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
  return (
    LEGACY_INTENT_MAP[normalized] ??
    (INTENT_SET.has(normalized as IntentName) ? (normalized as IntentName) : 'UNKNOWN')
  );
};

const normalizeConfidence = (value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const normalizeRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
};

export class EnhancedNLUService {
  constructor(
    private readonly openai: OpenAI = getOpenAI(),
    private readonly promptBuilder: PromptBuilder = new PromptBuilder(),
  ) {}

  async parseWithContext(
    message: string,
    state: ConversationState | null,
    tenant: TenantEntity & { config?: Record<string, unknown>; features?: Record<string, unknown> },
  ): Promise<IntentResult> {
    try {
      if (!config.OPENAI_MODEL) {
        throw new Error('OPENAI_MODEL is not configured');
      }
      if (config.OPENAI_TEMPERATURE === undefined) {
        throw new Error('OPENAI_TEMPERATURE is not configured');
      }
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

      return {
        intent: normalizeIntent(parsed.intent),
        confidence: normalizeConfidence(parsed.confidence),
        entities: normalizeRecord((parsed as { entities?: unknown }).entities),
        missing: normalizeStringArray((parsed as { missing?: unknown }).missing),
        ambiguity: normalizeStringArray((parsed as { ambiguity?: unknown }).ambiguity),
        warnings: normalizeStringArray((parsed as { warnings?: unknown }).warnings),
      } satisfies IntentResult;
    } catch {
      return {
        intent: 'UNKNOWN',
        confidence: 0,
        entities: {},
        missing: [],
        ambiguity: [],
        warnings: ['nlu_fallback'],
      };
    }
  }
}
