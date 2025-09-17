import OpenAI from 'openai';

import type { ConversationState } from '@services/cache/conversation-cache.js';

import type { TenantEntity } from '@core/entities/tenant.entity.js';
import type {
  IntentAmbiguity,
  IntentEntity,
  IntentName,
  IntentResult,
} from '@core/interfaces/index.js';

import { getOpenAI } from '@infra/openai/openai.client.js';

import { config } from '@config/env.config';

import { PromptBuilder } from './prompt.builder.js';

const INTENT_ALIASES: Record<string, IntentName> = {
  CREATE: 'CREATE_BOOKING',
  CREATE_BOOKING: 'CREATE_BOOKING',
  MODIFY: 'MODIFY_BOOKING',
  MODIFY_BOOKING: 'MODIFY_BOOKING',
  CANCEL: 'CANCEL_BOOKING',
  CANCEL_BOOKING: 'CANCEL_BOOKING',
  GET_INFO: 'GET_INFO',
  GETINFO: 'GET_INFO',
  GET_INFORMATION: 'GET_INFO',
  CONFIRM: 'CONFIRM_BOOKING',
  CONFIRM_BOOKING: 'CONFIRM_BOOKING',
  CONFIRMATION: 'CONFIRM_BOOKING',
  UNKNOWN: 'UNKNOWN',
};

function normalizeIntent(value: unknown): IntentName {
  if (typeof value !== 'string') return 'UNKNOWN';
  const normalized = value.trim().toUpperCase();
  return INTENT_ALIASES[normalized] ?? 'UNKNOWN';
}

function sanitizeEntities(raw: unknown): Record<string, IntentEntity | undefined> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const result: Record<string, IntentEntity | undefined> = {};
  for (const [key, value] of entries) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = value as IntentEntity;
      continue;
    }
    if (value !== undefined && value !== null) {
      result[key] = { value };
    }
  }
  return result;
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'field' in (item as Record<string, unknown>)) {
        const field = (item as Record<string, unknown>).field;
        if (typeof field === 'string') return field;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function sanitizeAmbiguity(raw: unknown): IntentAmbiguity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const fieldValue =
          'field' in item && typeof (item as any).field === 'string'
            ? (item as any).field
            : 'unknown';
        const options =
          'options' in item && Array.isArray((item as any).options)
            ? ((item as any).options.filter(
                (opt: unknown) => !opt || typeof opt === 'object',
              ) as IntentEntity[])
            : undefined;
        return { field: fieldValue, options } satisfies IntentAmbiguity;
      }
      if (typeof item === 'string') {
        return { field: item } satisfies IntentAmbiguity;
      }
      return null;
    })
    .filter((item): item is IntentAmbiguity => item !== null);
}

function sanitizeWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

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

      const intent = normalizeIntent(parsed.intent);

      let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      if (confidence < 0 || confidence > 1 || Number.isNaN(confidence)) confidence = 0;

      const entities = sanitizeEntities(parsed.entities);
      const missing = asStringArray(parsed.missing);
      const ambiguity = sanitizeAmbiguity(parsed.ambiguity);
      const warnings = sanitizeWarnings(parsed.warnings);

      return { intent, confidence, entities, missing, ambiguity, warnings };
    } catch {
      return {
        intent: 'UNKNOWN',
        confidence: 0,
        entities: {},
        missing: [],
        ambiguity: [],
        warnings: ['nlu_fallback'],
      } satisfies IntentResult;
    }
  }
}
