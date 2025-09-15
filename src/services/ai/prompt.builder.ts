import type { Tenant } from '@prisma/client';

import type { ConversationState } from '@services/cache/conversation-cache.js';

type PromptPayload = {
  system: string;
  user: string;
  version: string;
};

type ResponseOptions = {
  intent: string;
  entities: Record<string, unknown>;
  missing: string[];
  context: {
    state: string;
    knownSlots?: Record<string, unknown>;
  };
};

export class PromptBuilder {
  private readonly tenant: Tenant;

  private readonly locale: string;

  constructor(tenant: Tenant, locale = 'it-IT') {
    this.tenant = tenant;
    this.locale = locale;
  }

  nlu(text: string, state?: ConversationState | null): PromptPayload {
    const timezone = this.tenant.timezone ?? 'Europe/Rome';
    const system = `You are an NLU parser for restaurant reservations. Language: ${this.locale}. Timezone: ${timezone}. Return ONLY valid JSON.`;

    const schema = [
      '{',
      '  "intent": "CREATE_BOOKING | MODIFY_BOOKING | CANCEL_BOOKING | ASK_INFO | CONFIRMATION | UNKNOWN",',
      '  "confidence": 0.0,',
      '  "entities": {',
      '    "when": { "dateISO": "YYYY-MM-DD", "timeISO": "HH:mm", "granularity": "day|time|partOfDay", "raw": "..." },',
      '    "people": { "value": 0, "raw": "..." },',
      '    "name": { "full": "..." },',
      '    "phone": { "e164": "+39...", "raw": "..." },',
      '    "bookingRef": "..."',
      '  },',
      '  "missing": ["when", "time", "people", "name", "phone", "bookingRef"],',
      '  "ambiguity": []',
      '}',
    ].join('\n');

    const userLines: string[] = [];
    userLines.push(`Tenant: ${this.tenant.name ?? 'restaurant'} (${timezone})`);
    userLines.push(`Conversation state: ${this.formatState(state)}`);
    userLines.push(`User message: """${text}"""`);
    userLines.push('Required JSON schema:');
    userLines.push(schema);
    userLines.push('Rules:');
    userLines.push(
      `- Answer strictly in valid JSON. Do not add explanations, markdown, comments or text outside the JSON object. Language for keys and values must follow locale ${this.locale}.`,
    );
    userLines.push('- List any missing information in the "missing" array.');
    userLines.push('- Confidence must be a number between 0 and 1.');
    userLines.push(
      '- Resolve Italian relative temporal expressions ("oggi", "domani", "dopodomani", "stasera", "domani sera", "tra due ore", "a pranzo", "in serata") into dateISO/timeISO using the tenant timezone.',
    );
    userLines.push(
      '- If only a part of the day is specified (es. "a cena", "a pranzo"), set granularity="partOfDay" and omit timeISO.',
    );
    userLines.push('- If data is uncertain, leave the field empty and include it in "missing".');
    userLines.push('- Phone numbers should include the +39 prefix when possible.');
    userLines.push('Examples:');
    userLines.push(
      'Input: "Domani alle 20 per 4 a nome Rossi" -> {"intent":"CREATE_BOOKING","confidence":0.85,"entities":{"when":{"dateISO":"2024-05-02","timeISO":"20:00"},"people":{"value":4},"name":{"full":"Rossi"}},"missing":[],"ambiguity":[]}',
    );
    userLines.push(
      'Input: "Siete aperti domani?" -> {"intent":"ASK_INFO","confidence":0.6,"entities":{},"missing":[],"ambiguity":[]}',
    );
    userLines.push('Respond only with the final JSON object.');

    const user = userLines.join('\n');

    return {
      system,
      user,
      version: 'nlu:v2',
    };
  }

  response(opts: ResponseOptions): PromptPayload {
    const timezone = this.tenant.timezone ?? 'Europe/Rome';
    const config = this.getTenantConfig();
    const system = [
      `You are Tom, a professional yet warm WhatsApp assistant for ${this.tenant.name}.`,
      `Communicate in ${this.locale}.`,
      'Keep replies concise (2-3 sentences), friendly, and helpful.',
      'Ask at most one question at a time and adapt to the user intent.',
      'Always answer using the provided locale and stay within the brand tone.',
      'Responses must be returned as JSON only.',
    ].join(' ');

    const userLines: string[] = [];
    userLines.push(`Timezone: ${timezone}`);
    userLines.push(`Opening hours: ${this.stringifyValue(config.openingHours ?? null)}`);
    userLines.push(`Capacity: ${this.stringifyValue(config.capacity ?? null)}`);
    userLines.push(`House rules: ${this.stringifyValue(config.rules ?? null)}`);
    userLines.push(`Conversation state: ${opts.context.state}`);
    userLines.push(`Known slots: ${this.stringifyValue(opts.context.knownSlots ?? {})}`);
    userLines.push(`Detected intent: ${opts.intent}`);
    userLines.push(`Detected entities: ${this.stringifyValue(opts.entities)}`);
    userLines.push(`Missing information: ${JSON.stringify(opts.missing ?? [])}`);
    userLines.push('Generate a reply strictly in the following JSON shape:');
    userLines.push('{');
    userLines.push('  "text": "<messaggio in linguaggio naturale in base al contesto>",');
    userLines.push('  "quick_replies": ["Opzione 1", "Opzione 2"]');
    userLines.push('}');
    userLines.push('Guidelines:');
    userLines.push(
      '- "text" must be written in the specified locale and stay within 2-3 sentences.',
    );
    userLines.push(
      '- Ask no more than one question. If nothing is missing, avoid redundant questions.',
    );
    userLines.push('- "quick_replies" should be contextual suggestions (can be empty).');
    userLines.push('- Respect opening hours, capacity and house rules when proposing solutions.');
    userLines.push('- Avoid markdown beyond simple emojis.');
    userLines.push('- Do not add any text outside the JSON structure.');

    const user = userLines.join('\n');

    return {
      system,
      user,
      version: 'resp:v1',
    };
  }

  private formatState(state?: ConversationState | null): string {
    if (!state) {
      return 'flow=IDLE, context={}';
    }
    const ctx = this.stringifyValue(state.context ?? {});
    return `flow=${state.flow}, context=${this.truncate(ctx)}`;
  }

  private getTenantConfig(): Record<string, unknown> {
    const raw = this.tenant.config;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    return raw as Record<string, unknown>;
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      return String(value);
    }
  }

  private truncate(value: string, max = 400): string {
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }
}
