import type { ConversationState } from '../conversation/state.types.js';

/**
 * @deprecated Use ConversationStateStore directly.
 */
export class ConversationCache {
  constructor() {
    throw new Error('ConversationCache is deprecated. Use ConversationStateStore instead.');
  }
}

export type { ConversationState };
