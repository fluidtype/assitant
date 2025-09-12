import { NotImplementedError } from '../../core/errors/not-implemented.error.js';
import type { WAEvent } from '../../types/index.js';

export class ConversationService {
  async processMessage(_event: WAEvent): Promise<void> {
    throw new NotImplementedError();
  }
}
