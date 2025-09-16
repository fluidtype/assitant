import type OpenAI from 'openai';
import type { Booking, Tenant } from '@prisma/client';
import { DateTime } from 'luxon';

import type { BookingProposal } from '@services/conversation/state.types.js';

import type { AlternativeSuggestion } from '@core/interfaces/booking.types.js';

import { withRetry } from '@infra/openai/chat.retry.js';
import { getOpenAI } from '@infra/openai/openai.client.js';

import { config } from '@config/env.config.js';

import { getFallbackQuickReplies, resolveLocale } from './i18n.js';
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

const DEFAULT_TIME = '20:00';
const DEFAULT_DURATION_MINUTES = 120;

const PART_OF_DAY_DEFAULTS: Record<
  NonNullable<BookingProposal['partOfDay']>,
  { time: string; durationMinutes: number }
> = {
  morning: { time: '10:00', durationMinutes: 90 },
  afternoon: { time: '13:00', durationMinutes: 90 },
  evening: { time: '20:00', durationMinutes: 120 },
  night: { time: '22:00', durationMinutes: 120 },
};

const MESSAGE_KEYS = [
  'timeout_reset',
  'reset_ok',
  'nlu_missing',
  'ask_clarify_low_conf',
  'nothing_to_confirm',
  'missing_fields',
  'ask_clarify',
  'cancelled_ok',
  'generic_fallback',
  'generic_error',
] as const;

type MessageKey = (typeof MESSAGE_KEYS)[number];

export class ResponseGenerator {
  constructor(private readonly openai: OpenAI = getOpenAI()) {}

  async generate(options: GenerateOptions): Promise<GeneratedReply> {
    const locale = this.resolveLocaleFromTenant(options.tenant);
    const builder = new PromptBuilder(options.tenant, locale);
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
          locale,
        );
      }

      const reply = this.normalizePayload(payload);
      if (!reply) {
        return this.buildFallback(
          options.missing,
          prompt.version,
          Date.now() - startedAt,
          'invalid_payload',
          locale,
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
        locale,
      );
    }
  }

  async askForMissing(tenant: Tenant, fields: string[]): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);
    if (!Array.isArray(fields) || fields.length === 0) {
      return this.localizedMessage('generic_fallback', lang);
    }

    const normalized = fields
      .map((field) => this.describeField(field, lang))
      .filter((value) => value.length > 0);

    if (normalized.length === 0) {
      return this.localizedMessage('generic_fallback', lang);
    }

    const list = this.formatList(normalized, locale);
    return lang === 'en'
      ? `I still need ${list} before I can go ahead.`
      : `Mi servono ancora ${list} prima di procedere.`;
  }

  async byKey(tenant: Tenant, key: MessageKey | string): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);
    return this.localizedMessage((key as MessageKey) ?? 'generic_fallback', lang);
  }

  async propose(
    tenant: Tenant,
    proposal: BookingProposal,
    _pendingActionId: string,
  ): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);
    const timezone = this.resolveTimezoneFromTenant(tenant);
    const startISO = this.resolveStartISOFromProposal(proposal, tenant);
    const start = DateTime.fromISO(startISO, { zone: timezone });
    const summary = this.describeProposal(proposal, start, lang, locale);

    return lang === 'en'
      ? `I can book ${summary}. Please reply "yes" to confirm or let me know if you'd like to change something.`
      : `Posso prenotare ${summary}. Rispondi "sì" per confermare oppure dimmi se vuoi cambiare qualcosa.`;
  }

  async confirmed(tenant: Tenant, booking: Booking, _pendingActionId: string): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);
    const timezone = this.resolveTimezoneFromTenant(tenant);

    const start = DateTime.fromJSDate(booking.startAt, { zone: timezone });
    const end = DateTime.fromJSDate(booking.endAt, { zone: timezone });

    const date = start.setLocale(locale).toLocaleString(DateTime.DATE_FULL);
    const time = `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`;

    return lang === 'en'
      ? `Great! Your table is confirmed for ${date} from ${time}. If you need to make changes just let me know.`
      : `Perfetto! Ho confermato il tuo tavolo per ${date} dalle ${time}. Se vuoi modificare qualcosa fammi sapere.`;
  }

  async modified(tenant: Tenant, booking: Booking, _pendingActionId: string): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);
    const timezone = this.resolveTimezoneFromTenant(tenant);

    const start = DateTime.fromJSDate(booking.startAt, { zone: timezone });
    const end = DateTime.fromJSDate(booking.endAt, { zone: timezone });

    const date = start.setLocale(locale).toLocaleString(DateTime.DATE_FULL);
    const time = `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`;

    return lang === 'en'
      ? `Done! I've updated your booking to ${date} from ${time}.`
      : `Fatto! Ho aggiornato la tua prenotazione a ${date} dalle ${time}.`;
  }

  async cancelled(tenant: Tenant, _booking: Booking, _pendingActionId: string): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);

    return lang === 'en'
      ? `Your booking has been cancelled. If you change your mind I'm here to help.`
      : `Ho annullato la prenotazione. Se cambi idea sono qui per aiutarti.`;
  }

  async conflictWithAlternatives(
    tenant: Tenant,
    alternatives: AlternativeSuggestion[],
  ): Promise<string> {
    const locale = this.resolveLocaleFromTenant(tenant);
    const lang = this.resolveLanguage(locale);
    const timezone = this.resolveTimezoneFromTenant(tenant);

    if (!Array.isArray(alternatives) || alternatives.length === 0) {
      return lang === 'en'
        ? `I'm sorry, there's no availability for that slot. Would you like to try another time or day?`
        : `Mi dispiace, non c'è disponibilità per quell'orario. Vuoi provare con un altro orario o un'altra data?`;
    }

    const top = alternatives.slice(0, 3);
    const formatted = top.map((alt) => this.describeAlternative(alt, timezone, locale));
    const list = this.formatList(formatted, locale);

    return lang === 'en'
      ? `That slot is full, but I can offer ${list}. Prefer one of these?`
      : `Quell'orario è al completo, ma posso offrirti ${list}. Te ne va bene uno?`;
  }

  resolveStartISOFromProposal(proposal: BookingProposal, tenant?: Tenant): string {
    const timezone = this.resolveTimezoneFromTenant(tenant);
    const start = this.computeStartDateTime(proposal, timezone);
    return start.toISO() ?? start.toUTC().toISO() ?? new Date().toISOString();
  }

  resolveEndISOFromProposal(proposal: BookingProposal, tenant?: Tenant): string {
    const timezone = this.resolveTimezoneFromTenant(tenant);
    const start = this.computeStartDateTime(proposal, timezone);
    const durationMinutes = this.resolveDurationMinutes(proposal);
    const end = start.plus({ minutes: durationMinutes });
    return end.toISO() ?? end.toUTC().toISO() ?? new Date().toISOString();
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
    locale: string,
  ): GeneratedReply {
    const quickReplies = this.suggestQuickReplies(missing, locale);

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

  private suggestQuickReplies(missing: string[], locale: string): string[] {
    if (!Array.isArray(missing) || missing.length === 0) {
      return [];
    }

    const normalized = missing.map((item) => item.toLowerCase());

    if (normalized.includes('time')) {
      return ['19:30', '20:00', '20:30'];
    }

    if (normalized.includes('when')) {
      return getFallbackQuickReplies('when', locale);
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

  private resolveLocaleFromTenant(tenant: Tenant): string {
    const raw = tenant?.config;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const locale = (raw as Record<string, unknown>).locale;
      if (typeof locale === 'string' && locale.trim().length > 0) {
        return resolveLocale(locale);
      }
    }
    return resolveLocale('it-IT');
  }

  private resolveTimezoneFromTenant(tenant?: Tenant): string {
    if (tenant?.timezone && typeof tenant.timezone === 'string') {
      return tenant.timezone;
    }
    return 'Europe/Rome';
  }

  private computeStartDateTime(proposal: BookingProposal, timezone: string): DateTime {
    const date = proposal.dateISO;
    if (!date) {
      return DateTime.now().setZone(timezone);
    }

    let time = proposal.timeISO;
    if (!time && proposal.partOfDay) {
      const defaults = PART_OF_DAY_DEFAULTS[proposal.partOfDay];
      if (defaults) {
        time = defaults.time;
      }
    }

    if (!time) {
      time = DEFAULT_TIME;
    }

    const iso = `${date}T${time}`;
    const dt = DateTime.fromISO(iso, { zone: timezone });
    if (dt.isValid) {
      return dt;
    }

    return DateTime.fromISO(date, { zone: timezone }).startOf('day');
  }

  private resolveDurationMinutes(proposal: BookingProposal): number {
    if (proposal.partOfDay) {
      const defaults = PART_OF_DAY_DEFAULTS[proposal.partOfDay];
      if (defaults) {
        return defaults.durationMinutes;
      }
    }
    return DEFAULT_DURATION_MINUTES;
  }

  private describeField(field: string, lang: 'it' | 'en'): string {
    const normalized = field.toLowerCase();
    const map: Record<string, { it: string; en: string }> = {
      when: { it: 'la data', en: 'the date' },
      dateiso: { it: 'la data', en: 'the date' },
      time: { it: "l'orario", en: 'the time' },
      timeiso: { it: "l'orario", en: 'the time' },
      people: { it: 'il numero di persone', en: 'the party size' },
      name: { it: 'il nome', en: 'the name' },
      phone: { it: 'il numero di telefono', en: 'the phone number' },
      bookingref: { it: 'il codice di prenotazione', en: 'the booking code' },
    };

    const match = map[normalized];
    if (match) {
      return match[lang];
    }
    return normalized;
  }

  private resolveLanguage(locale: string): 'it' | 'en' {
    return locale.toLowerCase().startsWith('en') ? 'en' : 'it';
  }

  private localizedMessage(key: MessageKey | string, lang: 'it' | 'en'): string {
    const messages: Record<'it' | 'en', Record<MessageKey, string>> = {
      it: {
        timeout_reset: 'Ho azzerato la conversazione per sicurezza. Ripartiamo pure!',
        reset_ok: 'Conversazione reimpostata. Come posso aiutarti?',
        nlu_missing: 'Non ho capito bene, puoi ripetere con qualche dettaglio in più?',
        ask_clarify_low_conf:
          'Puoi confermare o aggiungere qualche dettaglio così ti aiuto meglio?',
        nothing_to_confirm: 'Non ho nulla da confermare al momento.',
        missing_fields: 'Mi mancano ancora alcune informazioni prima di procedere.',
        ask_clarify: 'Certo! Dimmi qualche dettaglio in più così preparo la prenotazione.',
        cancelled_ok: 'Ho annullato la richiesta. Se ti serve altro sono qui.',
        generic_fallback: 'Dimmi pure come posso aiutarti con la prenotazione.',
        generic_error: "C'è stato un problema inatteso, puoi riprovare tra poco?",
      },
      en: {
        timeout_reset: "I reset the conversation just to be safe. Let's start again!",
        reset_ok: 'Conversation reset. How can I help you?',
        nlu_missing: "I didn't catch that, could you repeat it with a few more details?",
        ask_clarify_low_conf: 'Could you confirm or add a few details so I can help?',
        nothing_to_confirm: "There's nothing to confirm right now.",
        missing_fields: 'I still need a couple of details before I can continue.',
        ask_clarify: "Sure! Give me a few more details and I'll take care of it.",
        cancelled_ok: 'All right, I cancelled that for you. Anything else?',
        generic_fallback: 'Let me know how I can help with your booking.',
        generic_error: 'Something unexpected happened, could you try again in a moment?',
      },
    };

    if (MESSAGE_KEYS.includes(key as MessageKey)) {
      return messages[lang][key as MessageKey];
    }

    return messages[lang].generic_fallback;
  }

  private describeProposal(
    proposal: BookingProposal,
    start: DateTime,
    lang: 'it' | 'en',
    locale: string,
  ): string {
    const name = proposal.name ? proposal.name.trim() : '';
    const people = proposal.people || 0;
    const datePart = start.setLocale(locale).toLocaleString(DateTime.DATE_FULL);
    const hasTime = Boolean(proposal.timeISO);
    const partOfDay = proposal.partOfDay;
    let timePart = '';

    if (hasTime) {
      timePart = start.toFormat('HH:mm');
    } else if (partOfDay) {
      timePart = this.describePartOfDay(partOfDay, lang);
    }

    const party = people > 0 ? people : undefined;

    if (lang === 'en') {
      const partyText = party ? `${party} people` : 'a table';
      const nameText = name ? `under ${name}` : '';
      const timeText = timePart ? ` ${timePart}` : '';
      return `${partyText} on ${datePart}${timeText}${nameText ? ` ${nameText}` : ''}`;
    }

    const partyText = party ? `${party} persone` : 'un tavolo';
    const nameText = name ? ` a nome ${name}` : '';
    const timeText = timePart ? ` ${timePart}` : '';
    return `${partyText} per ${datePart}${timeText}${nameText}`.trim();
  }

  private describePartOfDay(
    partOfDay: NonNullable<BookingProposal['partOfDay']>,
    lang: 'it' | 'en',
  ): string {
    const map: Record<NonNullable<BookingProposal['partOfDay']>, { it: string; en: string }> = {
      morning: { it: 'in mattinata', en: 'in the morning' },
      afternoon: { it: 'nel pomeriggio', en: 'in the afternoon' },
      evening: { it: 'in serata', en: 'in the evening' },
      night: { it: 'in tarda serata', en: 'at night' },
    };
    return map[partOfDay][lang];
  }

  private describeAlternative(
    alt: AlternativeSuggestion,
    timezone: string,
    locale: string,
  ): string {
    const start = DateTime.fromISO(alt.start, { zone: timezone });
    const end = DateTime.fromISO(alt.end, { zone: timezone });
    const date = start.setLocale(locale).toLocaleString(DateTime.DATE_FULL);
    const time = `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`;
    return `${date} ${time}`;
  }

  private formatList(items: string[], locale: string): string {
    if (items.length === 1) return items[0];
    try {
      const lf = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
      return lf.format(items);
    } catch {
      return items.join(', ');
    }
  }
}
