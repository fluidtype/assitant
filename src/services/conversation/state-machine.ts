import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export enum Flow {
  DEFAULT = 'DEFAULT',
}

export class ConversationStateMachine {
  current: Flow = Flow.DEFAULT;

  next(): Flow {
    throw new NotImplementedError();
  }
}
