import { DateTime } from 'luxon';

import type { ConversationEvent, ConversationState, PendingAction } from './state.types.js';
import { newPendingId } from './state-store.js';

export interface Effect {
  type:
    | 'ASK_MISSING'
    | 'PROPOSE_BOOKING'
    | 'CONFIRM_BOOKING'
    | 'CANCEL_BOOKING'
    | 'MODIFY_BOOKING'
    | 'RESPOND_TEXT';
  payload?: any;
}

export interface ReduceResult {
  state: ConversationState;
  effects: Effect[];
  warnings?: string[];
}

const CRITICALS = {
  CREATE: ['name', 'people', 'dateISO'],
  MODIFY: ['bookingRef', 'dateISO'],
  CANCEL: ['bookingRef'],
} as const;

type CriticalKind = keyof typeof CRITICALS;

function hasCriticals(ctx: unknown, type: CriticalKind): boolean {
  if (!ctx || typeof ctx !== 'object') return false;
  const source = ctx as Record<string, unknown>;
  const required = CRITICALS[type];
  return required.every((k) => Boolean(source[k]));
}

function nowIso(): string {
  return new Date().toISOString();
}

function expiresInMinutes(min: number): string {
  return DateTime.now().plus({ minutes: min }).toISO();
}

function mapPartOfDay(raw?: string): ConversationState['context']['partOfDay'] | undefined {
  if (!raw) return undefined;
  const text = raw.toLowerCase();
  if (/sera|serata|cena/.test(text)) return 'evening';
  if (/pomeriggio/.test(text)) return 'afternoon';
  if (/mattina/.test(text)) return 'morning';
  if (/notte/.test(text)) return 'night';
  return undefined;
}

export class ConversationStateMachine {
  constructor(
    private readonly ttlMinutes = 20,
    private readonly minConfidence = 0.6,
  ) {}

  reduce(current: ConversationState, event: ConversationEvent): ReduceResult {
    const s: ConversationState = { ...current, updatedAt: nowIso() };
    const effects: Effect[] = [];
    const warnings: string[] = [];

    switch (event.type) {
      case 'TIMEOUT':
        return {
          state: {
            ...s,
            flow: 'IDLE',
            context: {},
            pendingAction: undefined,
          },
          effects: [{ type: 'RESPOND_TEXT', payload: { key: 'timeout_reset' } }],
        };

      case 'RESET':
        return {
          state: {
            ...s,
            flow: 'IDLE',
            context: {},
            pendingAction: undefined,
          },
          effects: [{ type: 'RESPOND_TEXT', payload: { key: 'reset_ok' } }],
        };

      case 'REJECT':
        return {
          state: {
            ...s,
            flow: 'IDLE',
            pendingAction: undefined,
          },
          effects: [{ type: 'RESPOND_TEXT', payload: { key: 'cancelled_ok' } }],
        };

      case 'CONFIRM':
        if (s.flow === 'CONFIRMING_ACTION' && s.pendingAction) {
          return this.confirmPending(s, warnings);
        }
        return {
          state: s,
          effects: [{ type: 'RESPOND_TEXT', payload: { key: 'nothing_to_confirm' } }],
        };

      case 'USER_MESSAGE': {
        const { nlu } = event.payload ?? {};
        if (!nlu) {
          return {
            state: s,
            effects: [{ type: 'RESPOND_TEXT', payload: { key: 'nlu_missing' } }],
          };
        }

        const ctx = { ...s.context };
        const entities = nlu.entities ?? {};

        if (entities.name?.full) ctx.name = entities.name.full;
        if (typeof entities.people?.value === 'number') ctx.people = entities.people.value;
        if (entities.when?.dateISO) ctx.dateISO = entities.when.dateISO;
        if (entities.when?.timeISO) ctx.timeISO = entities.when.timeISO;
        if (entities.when?.granularity === 'partOfDay') {
          ctx.partOfDay = mapPartOfDay(entities.when.raw);
        }
        if (entities.bookingRef) ctx.bookingRef = entities.bookingRef;
        ctx.lastNLU = nlu;

        const intent = (nlu.intent ?? 'UNKNOWN') as string;
        const confidence = typeof nlu.confidence === 'number' ? nlu.confidence : 0;

        if (confidence < this.minConfidence && intent !== 'CONFIRMATION') {
          return {
            state: { ...s, context: ctx },
            effects: [{ type: 'RESPOND_TEXT', payload: { key: 'ask_clarify_low_conf' } }],
            warnings,
          };
        }

        if (intent === 'CONFIRMATION') {
          if (s.flow !== 'CONFIRMING_ACTION' || !s.pendingAction) {
            return {
              state: { ...s, context: ctx },
              effects: [{ type: 'RESPOND_TEXT', payload: { key: 'nothing_to_confirm' } }],
            };
          }

          return this.confirmPending({ ...s, context: ctx }, warnings);
        }

        if (intent === 'CREATE_BOOKING') {
          const ready = hasCriticals(ctx, 'CREATE');
          if (!ready) {
            const missing = ['name', 'people', 'dateISO'].filter(
              (k) => !ctx[k as keyof typeof ctx],
            );
            return {
              state: { ...s, flow: 'GATHERING_INFO', context: ctx },
              effects: [{ type: 'ASK_MISSING', payload: { fields: missing } }],
            };
          }

          const pending: PendingAction = {
            id: newPendingId(),
            type: 'CREATE',
            proposal: {
              tenantId: this.resolveTenantId(event, s),
              name: ctx.name!,
              people: ctx.people!,
              dateISO: ctx.dateISO!,
              timeISO: ctx.timeISO,
              partOfDay: ctx.partOfDay,
            },
            createdAt: nowIso(),
            expiresAt: expiresInMinutes(this.ttlMinutes),
          };

          return {
            state: {
              ...s,
              flow: 'CONFIRMING_ACTION',
              context: ctx,
              pendingAction: pending,
            },
            effects: [
              {
                type: 'PROPOSE_BOOKING',
                payload: {
                  proposal: pending.proposal,
                  pendingActionId: pending.id,
                },
              },
            ],
          };
        }

        if (intent === 'MODIFY_BOOKING') {
          if (!hasCriticals(ctx, 'MODIFY')) {
            const missing = ['bookingRef', 'dateISO'].filter((k) => !ctx[k as keyof typeof ctx]);
            return {
              state: { ...s, flow: 'GATHERING_INFO', context: ctx },
              effects: [{ type: 'ASK_MISSING', payload: { fields: missing } }],
            };
          }

          const pending: PendingAction = {
            id: newPendingId(),
            type: 'MODIFY',
            proposal: {
              tenantId: this.resolveTenantId(event, s),
              name: ctx.name ?? '',
              people: ctx.people ?? 0,
              dateISO: ctx.dateISO!,
              timeISO: ctx.timeISO,
              bookingRef: ctx.bookingRef!,
            },
            createdAt: nowIso(),
            expiresAt: expiresInMinutes(this.ttlMinutes),
          };

          return {
            state: {
              ...s,
              flow: 'CONFIRMING_ACTION',
              context: ctx,
              pendingAction: pending,
            },
            effects: [
              {
                type: 'PROPOSE_BOOKING',
                payload: {
                  proposal: pending.proposal,
                  pendingActionId: pending.id,
                },
              },
            ],
          };
        }

        if (intent === 'CANCEL_BOOKING') {
          if (!hasCriticals(ctx, 'CANCEL')) {
            const missing = ['bookingRef'].filter((k) => !ctx[k as keyof typeof ctx]);
            return {
              state: { ...s, flow: 'GATHERING_INFO', context: ctx },
              effects: [{ type: 'ASK_MISSING', payload: { fields: missing } }],
            };
          }

          const pending: PendingAction = {
            id: newPendingId(),
            type: 'CANCEL',
            proposal: {
              tenantId: this.resolveTenantId(event, s),
              name: ctx.name ?? '',
              people: 0,
              dateISO: DateTime.now().toISODate()!,
              bookingRef: ctx.bookingRef!,
            },
            createdAt: nowIso(),
            expiresAt: expiresInMinutes(this.ttlMinutes),
          };

          return {
            state: {
              ...s,
              flow: 'CONFIRMING_ACTION',
              context: ctx,
              pendingAction: pending,
            },
            effects: [
              {
                type: 'PROPOSE_BOOKING',
                payload: {
                  proposal: pending.proposal,
                  pendingActionId: pending.id,
                },
              },
            ],
          };
        }

        return {
          state: { ...s, flow: 'GATHERING_INFO', context: ctx },
          effects: [{ type: 'RESPOND_TEXT', payload: { key: 'ask_clarify' } }],
        };
      }

      default:
        return { state: s, effects, warnings };
    }
  }

  private confirmPending(state: ConversationState, warnings: string[]): ReduceResult {
    const pending = state.pendingAction;
    if (!pending) {
      return {
        state,
        effects: [{ type: 'RESPOND_TEXT', payload: { key: 'nothing_to_confirm' } }],
      };
    }

    const proposal = pending.proposal;
    if (!hasCriticals(proposal, pending.type)) {
      warnings.push('invariants_violation_before_confirm');
      return {
        state: {
          ...state,
          flow: 'GATHERING_INFO',
          pendingAction: undefined,
        },
        effects: [{ type: 'RESPOND_TEXT', payload: { key: 'missing_fields' } }],
        warnings,
      };
    }

    let effectType: Effect['type'] = 'CONFIRM_BOOKING';
    if (pending.type === 'CANCEL') effectType = 'CANCEL_BOOKING';
    else if (pending.type === 'MODIFY') effectType = 'MODIFY_BOOKING';

    return {
      state,
      effects: [
        {
          type: effectType,
          payload: {
            pendingActionId: pending.id,
            proposal,
          },
        },
      ],
    };
  }

  private resolveTenantId(event: ConversationEvent, state: ConversationState): string {
    const payloadTenant = (event.payload as { tenantId?: string } | undefined)?.tenantId;
    if (typeof payloadTenant === 'string' && payloadTenant.length > 0) {
      return payloadTenant;
    }
    if (state.pendingAction?.proposal.tenantId) {
      return state.pendingAction.proposal.tenantId;
    }
    return '';
  }
}
