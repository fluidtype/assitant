import type { WAEvent } from '../../types/index.js';

import { BookingService } from '../booking/booking.service.js';

export class ConversationService {
  constructor(private readonly booking = new BookingService()) {}

  async processMessage(event: WAEvent): Promise<{ replyText: string }> {
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
          const cancelled = await this.booking.cancelBooking(
            payload.id,
            payload.tenantId,
          );
          return { replyText: `cancelled: ${cancelled.id}` };
        }
        if (msg.startsWith('GETBYID:')) {
          const payload = JSON.parse(msg.slice('GETBYID:'.length));
          const found = await this.booking.getBookingById(payload.tenantId, payload.id);
          return { replyText: JSON.stringify(found) };
        }
        if (msg.startsWith('GETBYUSER:')) {
          const payload = JSON.parse(msg.slice('GETBYUSER:'.length));
          const found = await this.booking.getBookingsByUser(
            payload.tenantId,
            payload.userPhone,
          );
          return { replyText: JSON.stringify(found) };
        }
      } catch (err) {
        return { replyText: `error: ${(err as Error).message}` };
      }
    }
    return { replyText: `echo: ${event.message}` };
  }
}
