export enum Flow {
  DEFAULT = 'DEFAULT',
}

export class ConversationStateMachine {
  current: Flow = Flow.DEFAULT;

  next() {
    throw new Error('Not implemented');
  }
}
