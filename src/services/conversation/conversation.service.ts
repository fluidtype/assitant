import type { IntentEntity, IntentResult } from '@core/interfaces/index.js';
import type { ModifyBookingDTO } from '@core/interfaces/booking.types.js';

import type { WAEvent } from '../../types/index.js';
import { BookingService } from '../booking/booking.service.js';

export class ConversationService {
  constructor(private readonly booking = new BookingService()) {}

  async processMessage(event: WAEvent, intent?: IntentResult): Promise<{ replyText: string }> {
    const msg = event.message || '';
    if (process.env.NODE_ENV !== 'production') {
      try {
        if (msg.startsWith('CREATE:')) {
          const payload = JSON.parse(msg.slice('CREATE:'.length));
          const created = await this.booking.createBooking(payload as any);
          return { replyText: `created: ${created.id}` };
        }
        if (msg.startsWith('MODIFY:')) {
          const payload = JSON.parse(msg.slice('MODIFY:'.length));
          const modified = await this.booking.modifyBooking(payload as any);
          return { replyText: `modified: ${modified.id}` };
        }
        if (msg.startsWith('CANCEL:')) {
          const payload = JSON.parse(msg.slice('CANCEL:'.length));
          const cancelled = await this.booking.cancelBooking(payload.id, payload.tenantId);
          return { replyText: `cancelled: ${cancelled.id}` };
        }
        if (msg.startsWith('GETBYID:')) {
          const payload = JSON.parse(msg.slice('GETBYID:'.length));
          const found = await this.booking.getBookingById(payload.tenantId, payload.id);
          return { replyText: JSON.stringify(found) };
        }
        if (msg.startsWith('GETBYUSER:')) {
          const payload = JSON.parse(msg.slice('GETBYUSER:'.length));
          const found = await this.booking.getBookingsByUser(payload.tenantId, payload.userPhone);
          return { replyText: JSON.stringify(found) };
        }
      } catch (err) {
        return { replyText: `error: ${(err as Error).message}` };
      }
    }

    if (intent) {
      const handled = await this.processIntent(event, intent);
      if (handled) return handled;
    }

    return { replyText: `echo: ${event.message}` };
  }

  private async processIntent(
    event: WAEvent,
    intent: IntentResult,
  ): Promise<{ replyText: string } | null> {
    if (intent.missing.length) {
      return {
        replyText: this.appendWarnings(
          `Mi servono ancora: ${intent.missing.join(', ')}`,
          intent.warnings,
        ),
      };
    }
    if (intent.ambiguity.length) {
      const fields = intent.ambiguity.map((item) => item.field).join(', ');
      return {
        replyText: this.appendWarnings(
          `Devo risolvere queste ambiguità: ${fields}`,
          intent.warnings,
        ),
      };
    }

    switch (intent.intent) {
      case 'CREATE_BOOKING':
        return this.handleCreate(event, intent);
      case 'MODIFY_BOOKING':
        return this.handleModify(event, intent);
      case 'CANCEL_BOOKING':
        return this.handleCancel(event, intent);
      case 'GET_INFO':
        return this.handleGetInfo(event, intent);
      case 'CONFIRM_BOOKING':
        return this.handleConfirm(intent);
      case 'UNKNOWN':
      default:
        break;
    }

    if (intent.warnings.length) {
      return { replyText: `Avviso NLU: ${intent.warnings.join(', ')}` };
    }
    return null;
  }

  private async handleCreate(event: WAEvent, intent: IntentResult): Promise<{ replyText: string }> {
    const name = this.extractString(intent.entities.name);
    const people = this.extractNumber(intent.entities.people);
    const schedule = this.extractSchedule(intent.entities.when);

    if (!name || !people || !schedule.startAtISO || !schedule.endAtISO) {
      return {
        replyText: this.appendWarnings(
          'Non ho abbastanza informazioni per creare la prenotazione.',
          intent.warnings,
        ),
      };
    }

    const created = await this.booking.createBooking({
      tenantId: event.tenantId,
      userPhone: event.userPhone,
      name,
      people,
      startAtISO: schedule.startAtISO,
      endAtISO: schedule.endAtISO,
    });

    return {
      replyText: this.appendWarnings(`Prenotazione creata: ${created.id}`, intent.warnings),
    };
  }

  private async handleModify(event: WAEvent, intent: IntentResult): Promise<{ replyText: string }> {
    const bookingId =
      this.extractString(intent.entities.bookingId) ??
      this.extractString(intent.entities.reference);
    const schedule = this.extractSchedule(intent.entities.when);
    const name = this.extractString(intent.entities.name);
    const people = this.extractNumber(intent.entities.people);
    const version = this.extractNumber(intent.entities.version);

    if (!bookingId) {
      return {
        replyText: this.appendWarnings(
          'Mi serve un riferimento della prenotazione da modificare.',
          intent.warnings,
        ),
      };
    }

    const patch: ModifyBookingDTO['patch'] = {};
    if (name) patch.name = name;
    if (typeof people === 'number' && !Number.isNaN(people)) patch.people = people;
    if (schedule.startAtISO) patch.startAtISO = schedule.startAtISO;
    if (schedule.endAtISO) patch.endAtISO = schedule.endAtISO;

    if (Object.keys(patch).length === 0) {
      return {
        replyText: this.appendWarnings(
          'Dimmi cosa modificare della prenotazione.',
          intent.warnings,
        ),
      };
    }

    const modified = await this.booking.modifyBooking({
      id: bookingId,
      tenantId: event.tenantId,
      patch,
      expectedVersion: typeof version === 'number' && !Number.isNaN(version) ? version : undefined,
    });

    return {
      replyText: this.appendWarnings(`Prenotazione aggiornata: ${modified.id}`, intent.warnings),
    };
  }

  private async handleCancel(event: WAEvent, intent: IntentResult): Promise<{ replyText: string }> {
    const bookingId =
      this.extractString(intent.entities.bookingId) ??
      this.extractString(intent.entities.reference);
    if (!bookingId) {
      return {
        replyText: this.appendWarnings('Dimmi quale prenotazione annullare.', intent.warnings),
      };
    }

    const cancelled = await this.booking.cancelBooking(bookingId, event.tenantId);
    return {
      replyText: this.appendWarnings(`Prenotazione annullata: ${cancelled.id}`, intent.warnings),
    };
  }

  private async handleGetInfo(
    event: WAEvent,
    intent: IntentResult,
  ): Promise<{ replyText: string }> {
    const list = await this.booking.getBookingsByUser(event.tenantId, event.userPhone);
    return {
      replyText: this.appendWarnings(
        `Prenotazioni trovate: ${JSON.stringify(list)}`,
        intent.warnings,
      ),
    };
  }

  private async handleConfirm(intent: IntentResult): Promise<{ replyText: string }> {
    return {
      replyText: this.appendWarnings('Conferma ricevuta, grazie!', intent.warnings),
    };
  }

  private extractString(entity: IntentEntity | undefined): string | undefined {
    if (!entity) return undefined;
    if (typeof entity.value === 'string') return entity.value;
    if (typeof entity.original === 'string') return entity.original;
    if (entity.value && typeof entity.value === 'object') {
      const valueObj = entity.value as Record<string, unknown>;
      const nestedValue = valueObj.value;
      if (typeof nestedValue === 'string') return nestedValue;
      if (typeof valueObj.text === 'string') return valueObj.text;
      if (typeof valueObj.id === 'string') return valueObj.id;
    }
    return undefined;
  }

  private extractNumber(entity: IntentEntity | undefined): number | undefined {
    if (!entity) return undefined;
    const candidates = [entity.value, (entity.value as any)?.value, entity.original];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
      if (typeof candidate === 'string' && candidate.trim()) {
        const parsed = Number(candidate.trim());
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return undefined;
  }

  private extractSchedule(entity: IntentEntity | undefined): {
    startAtISO?: string;
    endAtISO?: string;
  } {
    if (!entity) return {};
    const sources: Array<IntentEntity | Record<string, unknown> | undefined> = [entity];
    if (entity.value && typeof entity.value === 'object' && !Array.isArray(entity.value)) {
      sources.push(entity.value as Record<string, unknown>);
    }

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const record = source as Record<string, unknown>;
      const start =
        this.pickIso(record.startAt) ??
        this.pickIso(record.startAtISO) ??
        this.pickIso(record.start);
      const end =
        this.pickIso(record.endAt) ?? this.pickIso(record.endAtISO) ?? this.pickIso(record.end);
      if (start && end) {
        return { startAtISO: start, endAtISO: end };
      }
    }

    if (typeof entity.value === 'string') {
      return { startAtISO: entity.value };
    }

    return {};
  }

  private pickIso(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed;
  }

  private appendWarnings(message: string, warnings: string[]): string {
    if (!warnings.length) return message;
    return `${message} (warning: ${warnings.join(', ')})`;
  }
}
