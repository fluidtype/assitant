import type OpenAI from 'openai';
import type { Tenant } from '@prisma/client';

import { withRetry } from '@infra/openai/chat.retry.js';
import { getOpenAI } from '@infra/openai/openai.client.js';

import { config } from '@config/env.config.js';

import { PromptBuilder } from './prompt.builder.js';

type GenerateOptions = {
  tenant: Tenant;
  intent: string;
  entities: Record<string, unknown>;
  missing: string[];
  context: {
    state: string;
    knownSlots?: Record<string, unknown>;
  };
};

export type GeneratedReply = {
  text: string;
  quick_replies?: string[];
  trace?: Record<string, unknown>;
};

const DEFAULT_TEMPERATURE = 0.3;

export class ResponseGenerator {
  constructor(private readonly openai: OpenAI = getOpenAI()) {}

  async generate(options: GenerateOptions): Promise<GeneratedReply> {
    const builder = new PromptBuilder(options.tenant, 'it-IT');
    const prompt = builder.response({
      intent: options.intent,
      entities: options.entities ?? {},
      missing: options.missing ?? [],
      context: options.context,
    });

    const model = config.OPENAI_MODEL ?? process.env.OPENAI_MODEL;
    if (!model) {
      throw new Error('OPENAI_MODEL is not configured');
    }

    const startedAt = Date.now();

    try {
      const completion = await withRetry(() =>
        this.openai.chat.completions.create(
          {
            model,
            temperature: DEFAULT_TEMPERATURE,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
          },
          { timeout: 20000 },
        ),
      );

      const raw = (completion.choices?.[0]?.message?.content ?? '')
        .trim()
        .replace(/^```(?:json)?|```$/g, '');

      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return this.buildFallback(
          options.missing,
          prompt.version,
          Date.now() - startedAt,
          'json_parse_error',
        );
      }

      const reply = this.normalizePayload(payload);
      if (!reply) {
        return this.buildFallback(
          options.missing,
          prompt.version,
          Date.now() - startedAt,
          'invalid_payload',
        );
      }

      const trace = {
        promptVersion: prompt.version,
        model: completion.model,
        latencyMs: Date.now() - startedAt,
      };

      return { ...reply, trace };
    } catch {
      return this.buildFallback(
        options.missing,
        prompt.version,
        Date.now() - startedAt,
        'openai_error',
      );
    }
  }

  private normalizePayload(payload: unknown): GeneratedReply | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const data = payload as Record<string, unknown>;
    const textValue = data.text;
    if (typeof textValue !== 'string') {
      return null;
    }

    const text = textValue.trim();
    if (!text) {
      return null;
    }

    const quickReplies = this.normalizeQuickReplies(data.quick_replies);

    const reply: GeneratedReply = { text };
    if (quickReplies.length > 0) {
      reply.quick_replies = quickReplies;
    }

    return reply;
  }

  private normalizeQuickReplies(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const replies: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const trimmed = item.trim();
      if (!trimmed) {
        continue;
      }
      if (!replies.includes(trimmed)) {
        replies.push(trimmed);
      }
      if (replies.length >= 3) {
        break;
      }
    }

    return replies.slice(0, 3);
  }

  private buildFallback(
    missing: string[],
    promptVersion: string,
    latencyMs: number,
    reason: string,
  ): GeneratedReply {
    const quickReplies = this.suggestQuickReplies(missing);

    const reply: GeneratedReply = {
      text: 'Scusa, puoi confermarmi i dettagli mancanti?',
      trace: {
        promptVersion,
        fallback: true,
        reason,
        latencyMs,
      },
    };

    if (quickReplies.length > 0) {
      reply.quick_replies = quickReplies;
    }

    return reply;
  }

  private suggestQuickReplies(missing: string[]): string[] {
    if (!Array.isArray(missing) || missing.length === 0) {
      return [];
    }

    const normalized = missing.map((item) => item.toLowerCase());

    if (normalized.includes('time')) {
      return ['19:30', '20:00', '20:30'];
    }

    if (normalized.includes('when')) {
      return ['Oggi', 'Domani', 'Questo weekend'];
    }

    if (normalized.includes('people')) {
      return ['2 persone', '4 persone', '6 persone'];
    }

    if (normalized.includes('name')) {
      return ['È a nome Marco', 'È a nome Giulia', 'È a nome Luca'];
    }

    if (normalized.includes('phone')) {
      return ['Ti lascio il numero', 'Preferisco non dirlo'];
    }

    if (normalized.includes('bookingref') || normalized.includes('bookingRef')) {
      return ['Ti mando il codice', 'Non ho il codice', 'Possiamo cercarlo insieme'];
    }

    return [];
  }
}
