import { sendWhatsAppMessage } from '@infra/whatsapp/whatsapp.client.js';

import { logger } from '@utils/logger.js';

export class WhatsAppService {
  async sendMessage(to: string, body: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: false },
    };

    try {
      await sendWhatsAppMessage(payload);
    } catch (err) {
      logger.error('WhatsApp send error', err);
      throw err;
    }
  }
}
