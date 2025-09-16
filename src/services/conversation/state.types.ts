export type Flow =
  | 'IDLE'
  | 'GATHERING_INFO'
  | 'CONFIRMING_ACTION'
  | 'CREATING_BOOKING'
  | 'MODIFYING_BOOKING'
  | 'CANCELLING_BOOKING';

export type PendingActionType = 'CREATE' | 'MODIFY' | 'CANCEL';

export interface BookingProposal {
  tenantId: string;
  name: string;
  people: number;
  dateISO: string;
  timeISO?: string;
  partOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  bookingRef?: string;
}

export interface ConversationContext {
  name?: string;
  people?: number;
  dateISO?: string;
  timeISO?: string;
  partOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  bookingRef?: string;
  lastNLU?: any;
}

export interface PendingAction {
  id: string;
  type: PendingActionType;
  proposal: BookingProposal;
  createdAt: string;
  expiresAt: string;
}

export interface ConversationStateV1 {
  machineVersion: 1;
  version: number;
  flow: Flow;
  context: ConversationContext;
  pendingAction?: PendingAction;
  updatedAt: string;
}

export type ConversationState = ConversationStateV1;

export type EventType = 'USER_MESSAGE' | 'CONFIRM' | 'REJECT' | 'TIMEOUT' | 'RESET';

export interface ConversationEvent<T = any> {
  type: EventType;
  payload?: T;
  at?: string;
}
