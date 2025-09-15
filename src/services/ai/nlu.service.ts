import { createHash } from 'crypto';
import { DateTime } from 'luxon';
import type OpenAI from 'openai';

import type { Tenant } from '@prisma/client';

import { config } from '@config/env.config.js';
import { withRetry } from '@infra/openai/chat.retry.js';
import { getOpenAI } from '@infra/openai/openai.client.js';
import { redis } from '@infra/redis/redis.client.js';
import type { ConversationState } from '@services/cache/conversation-cache.js';

import type {
  NLUEntities,
  NLUIntent,
  NLUResult,
  MissingField,
  PartySize,
  PersonName,
  Phone,
  TemporalRef,
} from './nlu.types.js';

const PROMPT_VERSION = 'nlu:v1';
const CACHE_TTL_SECONDS = 900;

const INTENT_MAP: Record<string, NLUIntent> = {
  CREATE_BOOKING: 'CREATE_BOOKING',
  CREATE: 'CREATE_BOOKING',
  NEW_BOOKING: 'CREATE_BOOKING',
  BOOKING_CREATE: 'CREATE_BOOKING',
  MODIFY_BOOKING: 'MODIFY_BOOKING',
  MODIFY: 'MODIFY_BOOKING',
  UPDATE_BOOKING: 'MODIFY_BOOKING',
  CHANGE_BOOKING: 'MODIFY_BOOKING',
  CANCEL_BOOKING: 'CANCEL_BOOKING',
  CANCEL: 'CANCEL_BOOKING',
  DELETE_BOOKING: 'CANCEL_BOOKING',
  ASK_INFO: 'ASK_INFO',
  GET_INFO: 'ASK_INFO',
  INFO: 'ASK_INFO',
  CONFIRMATION: 'CONFIRMATION',
  CONFIRM: 'CONFIRMATION',
  UNKNOWN: 'UNKNOWN',
};

export class EnhancedNLUService {
  constructor(private readonly openai: OpenAI = getOpenAI()) {}

  async parse(message: string, state: ConversationState | null, tenant: Tenant): Promise<NLUResult> {
    const startedAt = Date.now();
    const cacheKey = this.buildCacheKey(message, tenant, state);
    const cached = await this.tryGetCachedResult(cacheKey, startedAt);
    if (cached) {
      return cached;
    }

    const model = config.OPENAI_MODEL ?? process.env.OPENAI_MODEL;
    if (!model) {
      throw new Error('OPENAI_MODEL is not configured');
    }

    const temperature = this.resolveTemperature();
    const timezone = this.getTimezone(tenant);
    const system = 'You are an Italian NLU parser for WhatsApp restaurant bookings. Return ONLY valid JSON.';
    const user = this.buildUserPrompt(message, tenant, timezone, state);

    try {
      const completion = await withRetry(() =>
        this.openai.chat.completions.create(
          {
            model,
            temperature,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          },
          { timeout: 20000 },
        ),
      );

      const raw = (completion.choices?.[0]?.message?.content ?? '')
        .trim()
        .replace(/^```(?:json)?|```$/g, '');

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          intent: 'UNKNOWN',
          entities: {},
          confidence: 0.2,
          missing: [],
          ambiguity: ['json_parse_error'],
          trace: { promptVersion: PROMPT_VERSION, latencyMs: Date.now() - startedAt },
        };
      }

      const normalized = this.normalize(parsed, tenant);
      const previousTrace = normalized.trace ?? {};
      normalized.trace = {
        ...previousTrace,
        model: completion.model ?? previousTrace.model,
        latencyMs: Date.now() - startedAt,
        promptVersion: PROMPT_VERSION,
      };

      await this.storeCachedResult(cacheKey, normalized);

      return normalized;
    } catch {
      return {
        intent: 'UNKNOWN',
        entities: {},
        confidence: 0.2,
        missing: [],
        ambiguity: ['openai_error'],
        trace: { promptVersion: PROMPT_VERSION, latencyMs: Date.now() - startedAt },
      };
    }
  }

  parseWithContext(message: string, state: ConversationState | null, tenant: Tenant): Promise<NLUResult> {
    return this.parse(message, state, tenant);
  }

  private buildCacheKey(message: string, tenant: Tenant, state: ConversationState | null): string {
    const text = message.trim();
    const tenantId = String(tenant.id);
    const flow = state?.flow ? String(state.flow) : 'IDLE';
    const payload = `${text}|${tenantId}|${flow}|${PROMPT_VERSION}`;
    return `nlu:${sha1(payload)}`;
  }

  private async tryGetCachedResult(cacheKey: string, startedAt: number): Promise<NLUResult | null> {
    try {
      if (!redis.isOpen) {
        await redis.connect();
      }
      const cachedRaw = await redis.get(cacheKey);
      if (!cachedRaw) return null;
      const cached = JSON.parse(cachedRaw) as NLUResult;
      const trace = {
        ...(cached.trace ?? {}),
        cache: true,
        promptVersion: PROMPT_VERSION,
        latencyMs: Date.now() - startedAt,
      };
      return { ...cached, trace };
    } catch {
      return null;
    }
  }

  private async storeCachedResult(cacheKey: string, result: NLUResult): Promise<void> {
    try {
      if (!redis.isOpen) {
        await redis.connect();
      }
      await redis.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL_SECONDS });
    } catch {
      // ignore cache errors
    }
  }

  private resolveTemperature(): number {
    if (typeof config.OPENAI_TEMPERATURE === 'number' && Number.isFinite(config.OPENAI_TEMPERATURE)) {
      return config.OPENAI_TEMPERATURE;
    }
    const env = process.env.OPENAI_TEMPERATURE;
    if (env !== undefined) {
      const parsed = Number(env);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0.1;
  }

  private buildUserPrompt(
    text: string,
    tenant: Tenant,
    timezone: string,
    state: ConversationState | null,
  ): string {
    const tenantName = tenant.name ?? tenant.id;
    const stateLine = state
      ? `ConversationState: flow=${state.flow}, context=${this.safeStateContext(state.context)}`
      : 'ConversationState: none';

    return [
      `Tenant: ${tenantName}`,
      stateLine,
      `Timezone: ${timezone}`,
      `Text: """${text}"""`,
      'Return ONLY JSON with this exact schema:',
      '{',
      '  "intent": "CREATE_BOOKING|MODIFY_BOOKING|CANCEL_BOOKING|ASK_INFO|CONFIRMATION|UNKNOWN",',
      '  "entities": {',
      '    "when": {"dateISO": "", "timeISO": "", "raw": "", "granularity": "day|time|partOfDay"},',
      '    "people": {"value": 0, "raw": ""},',
      '    "name": {"full": ""},',
      '    "phone": {"raw": "", "e164": ""},',
      '    "bookingRef": ""',
      '  },',
      '  "confidence": 0.0,',
      '  "missing": [],',
      '  "ambiguity": []',
      '}',
      'Guidelines:',
      '- Parse Italian WhatsApp conversations about restaurant bookings.',
      '- Interpret temporal expressions (oggi, domani, dopodomani, stasera, domani sera, ecc.) in the provided timezone.',
      '- Leave fields empty or null when information is missing; never invent values.',
      '- Confidence must be between 0 and 1.',
      '- If something is missing, list the field name in "missing".',
      'Examples:',
      '1. "Domani alle 20 per 4 a nome Rossi"',
      '2. "Sposta la mia prenotazione di stasera alle 21"',
      '3. "Annulla prenotazione Marco"',
      'Respond with JSON only.',
    ].join('\n');
  }

  private normalize(input: unknown, tenant: Tenant): NLUResult {
    const record = this.asRecord(input);
    const intent = this.normalizeIntent(record?.intent);
    const confidence = this.clampConfidence(record?.confidence);
    const entities = this.normalizeEntities(record?.entities, tenant);
    const missing = this.computeMissing(intent, entities);
    const ambiguity = this.normalizeStringArray(record?.ambiguity);
    const trace = this.normalizeTrace(record?.trace);

    return {
      intent,
      entities,
      confidence,
      missing,
      ambiguity,
      trace,
    };
  }

  private normalizeIntent(raw: unknown): NLUIntent {
    if (typeof raw !== 'string') return 'UNKNOWN';
    const key = raw.trim().toUpperCase().replace(/[^A-Z_]/g, '_');
    return INTENT_MAP[key] ?? 'UNKNOWN';
  }

  private clampConfidence(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.min(1, Math.max(0, raw));
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) {
        return Math.min(1, Math.max(0, parsed));
      }
    }
    return 0;
  }

  private normalizeEntities(input: unknown, tenant: Tenant): NLUEntities {
    const record = this.asRecord(input);
    if (!record) return {};

    const timezone = this.getTimezone(tenant);
    const entities: NLUEntities = {};

    const when = this.normalizeWhen(record.when, timezone);
    if (when) entities.when = when;

    const people = this.normalizePeople(record.people);
    if (people) entities.people = people;

    const name = this.normalizeName(record.name);
    if (name) entities.name = name;

    const phone = this.normalizePhone(record.phone);
    if (phone) entities.phone = phone;

    const bookingRef = this.normalizeBookingRef(record.bookingRef);
    if (bookingRef) entities.bookingRef = bookingRef;

    return entities;
  }

  private normalizeWhen(input: unknown, timezone: string): TemporalRef | undefined {
    if (input === null || input === undefined) return undefined;

    const ref: TemporalRef = {};
    if (typeof input === 'string') {
      ref.raw = input;
    } else if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (typeof obj.raw === 'string') ref.raw = obj.raw;
      if (typeof obj.dateISO === 'string') ref.dateISO = obj.dateISO;
      else if (typeof obj.dateIso === 'string') ref.dateISO = obj.dateIso;
      else if (typeof obj.date === 'string') ref.dateISO = obj.date;
      if (typeof obj.timeISO === 'string') ref.timeISO = obj.timeISO;
      else if (typeof obj.timeIso === 'string') ref.timeISO = obj.timeIso;
      else if (typeof obj.time === 'string') ref.timeISO = obj.time;
      if (typeof obj.granularity === 'string') ref.granularity = this.normalizeGranularity(obj.granularity);
    }

    const resolvedDate = this.resolveDate(ref, timezone);
    if (resolvedDate) ref.dateISO = resolvedDate;
    else delete ref.dateISO;

    const resolvedTime = this.resolveTime(ref.timeISO, timezone);
    if (resolvedTime) ref.timeISO = resolvedTime;
    else delete ref.timeISO;

    const rawText = ref.raw ?? '';
    const hasPartOfDay = this.containsPartOfDay(rawText);
    if (!ref.timeISO && hasPartOfDay) {
      ref.granularity = 'partOfDay';
    } else if (ref.timeISO) {
      ref.granularity = 'time';
    } else if (ref.dateISO) {
      ref.granularity = 'day';
    } else if (!ref.granularity) {
      delete ref.granularity;
    }

    if (ref.raw) ref.raw = ref.raw.trim();
    if (ref.raw === '') delete ref.raw;

    return Object.keys(ref).length ? ref : undefined;
  }

  private normalizePeople(input: unknown): PartySize | undefined {
    if (input === null || input === undefined) return undefined;

    const entity: PartySize = {};
    if (typeof input === 'number' && Number.isFinite(input)) {
      const value = Math.round(input);
      if (value > 0) entity.value = value;
    } else if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed) entity.raw = trimmed;
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(parsed) && parsed > 0) entity.value = parsed;
    } else if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (typeof obj.raw === 'string' && obj.raw.trim()) entity.raw = obj.raw.trim();
      const value = obj.value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Math.round(value);
        if (rounded > 0) entity.value = rounded;
      } else if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isNaN(parsed) && parsed > 0) entity.value = parsed;
      }
      if (entity.value === undefined && entity.raw) {
        const parsed = Number.parseInt(entity.raw, 10);
        if (!Number.isNaN(parsed) && parsed > 0) entity.value = parsed;
      }
    }

    return Object.keys(entity).length ? entity : undefined;
  }

  private normalizeName(input: unknown): PersonName | undefined {
    if (input === null || input === undefined) return undefined;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      return trimmed ? { full: trimmed } : undefined;
    }
    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (typeof obj.full === 'string' && obj.full.trim()) {
        return { full: obj.full.trim() };
      }
      if (typeof obj.name === 'string' && obj.name.trim()) {
        return { full: obj.name.trim() };
      }
    }
    return undefined;
  }

  private normalizePhone(input: unknown): Phone | undefined {
    if (input === null || input === undefined) return undefined;

    const result: Phone = {};
    let candidate: string | undefined;
    if (typeof input === 'string') {
      candidate = input.trim();
    } else if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (typeof obj.raw === 'string' && obj.raw.trim()) result.raw = obj.raw.trim();
      if (typeof obj.e164 === 'string' && obj.e164.trim()) {
        const normalized = this.toE164(obj.e164.trim());
        if (normalized) result.e164 = normalized;
      }
      if (!candidate && typeof obj.value === 'string') {
        candidate = obj.value.trim();
      }
    }

    if (!result.raw && candidate) {
      result.raw = candidate;
    }

    const e164 = this.toE164(result.e164 ?? candidate ?? result.raw);
    if (e164) result.e164 = e164;

    return Object.keys(result).length ? result : undefined;
  }

  private normalizeBookingRef(input: unknown): string | undefined {
    if (typeof input === 'string') {
      const trimmed = input.trim();
      return trimmed || undefined;
    }
    return undefined;
  }

  private normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const arr = input.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return arr.map((value) => value.trim());
  }

  private normalizeTrace(input: unknown): NLUResult['trace'] | undefined {
    const record = this.asRecord(input);
    if (!record) return undefined;
    const trace: NLUResult['trace'] = {};
    if (typeof record.model === 'string') trace.model = record.model;
    if (typeof record.latencyMs === 'number' && Number.isFinite(record.latencyMs)) {
      trace.latencyMs = record.latencyMs;
    }
    if (typeof record.promptVersion === 'string') trace.promptVersion = record.promptVersion;
    if (typeof record.cache === 'boolean') trace.cache = record.cache;
    return Object.keys(trace).length ? trace : undefined;
  }

  private computeMissing(intent: NLUIntent, entities: NLUEntities): MissingField[] {
    const missing = new Set<MissingField>();
    const hasDate = Boolean(entities.when?.dateISO);
    const hasTime = Boolean(entities.when?.timeISO);
    const partOfDay = entities.when?.granularity === 'partOfDay';

    if (intent === 'CREATE_BOOKING') {
      if (!hasDate) missing.add('when');
      if (!hasTime && !partOfDay) missing.add('time');
      if (!entities.people?.value) missing.add('people');
      if (!entities.name?.full) missing.add('name');
    } else if (intent === 'MODIFY_BOOKING') {
      if (!entities.bookingRef) missing.add('bookingRef');
      if (!hasDate) missing.add('when');
      if (!hasTime && !partOfDay) missing.add('time');
    } else if (intent === 'CANCEL_BOOKING') {
      if (!entities.bookingRef && !entities.name?.full) missing.add('bookingRef');
    }

    return Array.from(missing);
  }

  private resolveDate(ref: TemporalRef, timezone: string): string | undefined {
    const candidates = [ref.dateISO, ref.raw];
    for (const candidate of candidates) {
      const normalized = this.normalizeDateString(candidate, timezone);
      if (normalized) return normalized;
    }
    return undefined;
  }

  private normalizeDateString(value: string | undefined, timezone: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const iso = DateTime.fromISO(trimmed, { zone: timezone });
    if (iso.isValid) {
      const isoDate = iso.toISODate();
      if (isoDate) return isoDate;
    }

    const formats = ['d/M/yyyy', 'd/M/yy', 'd-M-yyyy', 'd-M-yy', 'd.M.yyyy', 'd.M.yy'];
    for (const fmt of formats) {
      const dt = DateTime.fromFormat(trimmed, fmt, { zone: timezone, locale: 'it' });
      if (dt.isValid) {
        const isoDate = dt.toISODate();
        if (isoDate) return isoDate;
      }
    }

    const shortFormats = ['d/M', 'd-M', 'd.M'];
    for (const fmt of shortFormats) {
      const dt = DateTime.fromFormat(trimmed, fmt, { zone: timezone, locale: 'it' });
      if (dt.isValid) {
        const isoDate = dt.set({ year: DateTime.now().setZone(timezone).year }).toISODate();
        if (isoDate) return isoDate;
      }
    }

    return this.resolveRelativeDate(trimmed, timezone);
  }

  private resolveRelativeDate(value: string | undefined, timezone: string): string | undefined {
    if (!value) return undefined;
    const normalized = this.normalizeText(value);
    if (!normalized) return undefined;

    const today = DateTime.now().setZone(timezone);
    if (!today.isValid) {
      const fallback = DateTime.now().setZone('Europe/Rome').startOf('day').toISODate();
      return fallback ?? undefined;
    }

    const base = today.startOf('day');

    if (/(ieri)/.test(normalized)) {
      const isoDate = base.minus({ days: 1 }).toISODate();
      if (isoDate) return isoDate;
    }
    if (/(dopodomani|dopo\s+domani)/.test(normalized)) {
      const isoDate = base.plus({ days: 2 }).toISODate();
      if (isoDate) return isoDate;
    }
    if (/(domani)/.test(normalized)) {
      const isoDate = base.plus({ days: 1 }).toISODate();
      if (isoDate) return isoDate;
    }
    if (
      /(oggi|stasera|sta\s+sera|in\s+serata|stanotte|stamattina|questa\s+mattina|questo\s+pomeriggio|questo\s+pranzo|questa\s+sera|questa\s+notte)/.test(
        normalized,
      )
    ) {
      const isoDate = base.toISODate();
      if (isoDate) return isoDate;
    }

    const inDays = normalized.match(/(?:tra|fra)\s+(\d{1,2})\s+giorni?/);
    if (inDays) {
      const offset = Number.parseInt(inDays[1], 10);
      if (!Number.isNaN(offset)) {
        const isoDate = base.plus({ days: offset }).toISODate();
        if (isoDate) return isoDate;
      }
    }

    return undefined;
  }

  private resolveTime(value: string | undefined, timezone: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const direct = DateTime.fromISO(trimmed, { zone: timezone });
    if (direct.isValid) return direct.toFormat('HH:mm');

    const normalized = trimmed.replace(/h/gi, ':').replace(/\./g, ':');
    const candidate = DateTime.fromFormat(normalized, 'H:mm', { zone: timezone });
    if (candidate.isValid) return candidate.toFormat('HH:mm');

    const candidateShort = DateTime.fromFormat(normalized, 'H', { zone: timezone });
    if (candidateShort.isValid) return candidateShort.toFormat('HH:mm');

    const match = normalized.match(/(\d{1,2})(?:[:](\d{2}))?/);
    if (match) {
      const hours = Number(match[1]);
      const minutes = match[2] ? Number(match[2]) : 0;
      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }

    return undefined;
  }

  private normalizeGranularity(value: string): TemporalRef['granularity'] | undefined {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'day' || normalized === 'time' || normalized === 'partofday') {
      return normalized === 'partofday' ? 'partOfDay' : (normalized as TemporalRef['granularity']);
    }
    if (normalized === 'part_of_day' || normalized === 'part-of-day') {
      return 'partOfDay';
    }
    return undefined;
  }

  private containsPartOfDay(raw: string): boolean {
    if (!raw) return false;
    const normalized = this.normalizeText(raw);
    if (!normalized) return false;
    const patterns = [
      /\bstasera\b/,
      /\bsera\b/,
      /\bserata\b/,
      /\bcena\b/,
      /\bpomeriggio\b/,
      /\bmattina\b/,
      /\bnotte\b/,
      /\bpranzo\b/,
      /\bmezzogiorno\b/,
    ];
    return patterns.some((pattern) => pattern.test(normalized));
  }

  private toE164(input: string | undefined): string | undefined {
    if (!input) return undefined;
    let value = input.trim();
    if (!value) return undefined;

    value = value.replace(/[\s-]/g, '');
    if (value.startsWith('00')) {
      value = `+${value.slice(2)}`;
    }

    if (!value.startsWith('+')) {
      const digitsOnly = value.replace(/\D/g, '');
      if (!digitsOnly) return undefined;
      if (digitsOnly.startsWith('39')) {
        const subscriber = digitsOnly.slice(2);
        if (this.isLikelyItalianSubscriber(subscriber)) {
          return `+39${subscriber}`;
        }
        return `+${digitsOnly}`;
      }
      if (this.isLikelyItalianSubscriber(digitsOnly)) {
        return `+39${digitsOnly}`;
      }
      return undefined;
    }

    const digits = value.slice(1).replace(/\D/g, '');
    if (!digits) return undefined;
    const candidate = `+${digits}`;
    if (candidate.startsWith('+39') && this.isLikelyItalianSubscriber(digits.slice(2))) {
      return candidate;
    }
    if (!candidate.startsWith('+')) return undefined;
    return candidate;
  }

  private isLikelyItalianSubscriber(value: string): boolean {
    return value.length >= 5 && value.length <= 11;
  }

  private safeStateContext(context: unknown): string {
    if (context === undefined) return 'undefined';
    try {
      const serialized = JSON.stringify(context);
      if (!serialized) return 'null';
      return serialized.length > 400 ? `${serialized.slice(0, 400)}…` : serialized;
    } catch {
      const text = String(context);
      return text.length > 200 ? `${text.slice(0, 200)}…` : text;
    }
  }

  private getTimezone(tenant: Tenant): string {
    const candidate = tenant.timezone ?? config.TIMEZONE ?? 'Europe/Rome';
    const dt = DateTime.now().setZone(candidate);
    if (dt.isValid) return candidate;
    return 'Europe/Rome';
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }
}

function sha1(str: string): string {
  return createHash('sha1').update(str).digest('hex');
}
