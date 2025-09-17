import { describe, expect, it, vi } from 'vitest';

import { ConversationService } from '@services/conversation/conversation.service.js';

function buildIntent(partial: Partial<import('@core/interfaces/index.js').IntentResult>) {
  return {
    intent: 'UNKNOWN',
    confidence: 0,
    entities: {},
    missing: [],
    ambiguity: [],
    warnings: [],
    ...partial,
  } satisfies import('@core/interfaces/index.js').IntentResult;
}

describe('ConversationService NLU adaptor', () => {
  it('creates a booking when all entities are present', async () => {
    const booking = {
      createBooking: vi.fn().mockResolvedValue({ id: 'bk1' }),
      modifyBooking: vi.fn(),
      cancelBooking: vi.fn(),
      getBookingsByUser: vi.fn(),
      getBookingById: vi.fn(),
    };
    const service = new ConversationService(booking as any);

    const intent = buildIntent({
      intent: 'CREATE_BOOKING',
      confidence: 0.9,
      entities: {
        name: { value: 'Rossi' },
        people: { value: 4 },
        when: {
          value: { startAt: '2025-09-18T20:00:00+02:00', endAt: '2025-09-18T21:00:00+02:00' },
        },
      },
    });

    const event = {
      tenantId: 'tenant-1',
      userPhone: '+390000000001',
      message: 'prenota',
      messageId: 'mid-1',
    } as const;

    const result = await service.processMessage(event, intent);

    expect(booking.createBooking).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userPhone: '+390000000001',
      name: 'Rossi',
      people: 4,
      startAtISO: '2025-09-18T20:00:00+02:00',
      endAtISO: '2025-09-18T21:00:00+02:00',
    });
    expect(result.replyText).toContain('Prenotazione creata');
  });

  it('returns missing info message before calling booking service', async () => {
    const booking = {
      createBooking: vi.fn(),
      modifyBooking: vi.fn(),
      cancelBooking: vi.fn(),
      getBookingsByUser: vi.fn(),
      getBookingById: vi.fn(),
    };
    const service = new ConversationService(booking as any);

    const intent = buildIntent({
      intent: 'CREATE_BOOKING',
      missing: ['when'],
      entities: {
        name: { value: 'Rossi' },
      },
    });

    const event = {
      tenantId: 'tenant-1',
      userPhone: '+390000000001',
      message: 'prenota',
      messageId: 'mid-1',
    } as const;

    const result = await service.processMessage(event, intent);

    expect(result.replyText).toContain('Mi servono ancora');
    expect(booking.createBooking).not.toHaveBeenCalled();
  });

  it('modifies a booking using extracted schedule and version', async () => {
    const booking = {
      createBooking: vi.fn(),
      modifyBooking: vi.fn().mockResolvedValue({ id: 'bk1' }),
      cancelBooking: vi.fn(),
      getBookingsByUser: vi.fn(),
      getBookingById: vi.fn(),
    };
    const service = new ConversationService(booking as any);

    const intent = buildIntent({
      intent: 'MODIFY_BOOKING',
      entities: {
        bookingId: { value: 'bk1' },
        when: {
          value: { startAtISO: '2025-09-18T20:00:00+02:00', endAtISO: '2025-09-18T21:00:00+02:00' },
        },
        people: { value: 5 },
        version: { value: 2 },
      },
    });

    const event = {
      tenantId: 'tenant-1',
      userPhone: '+390000000001',
      message: 'modifica',
      messageId: 'mid-2',
    } as const;

    const result = await service.processMessage(event, intent);

    expect(booking.modifyBooking).toHaveBeenCalledWith({
      id: 'bk1',
      tenantId: 'tenant-1',
      patch: {
        people: 5,
        startAtISO: '2025-09-18T20:00:00+02:00',
        endAtISO: '2025-09-18T21:00:00+02:00',
      },
      expectedVersion: 2,
    });
    expect(result.replyText).toContain('Prenotazione aggiornata');
  });
});
