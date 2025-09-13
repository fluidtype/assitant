import type { WAEvent } from '../../types/index.js';

export class ConversationService {
  async processMessage(event: WAEvent): Promise<{ replyText: string }> {
    const replyText = `echo: ${event.message}`;
    return { replyText };
  }
}
