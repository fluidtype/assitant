import type { ConversationState } from '../conversation/state.types.js';

/**
 * @deprecated Use conversation state store helpers instead.
 */
export class ConversationCache {
  constructor() {
    throw new Error('ConversationCache is deprecated. Use state-store helpers instead.');
  }
}

export type { ConversationState };
