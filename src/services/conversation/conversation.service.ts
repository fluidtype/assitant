import type { Tenant } from '@prisma/client';

import { EnhancedNLUService } from '@services/ai/nlu.service.js';
import { ResponseGenerator } from '@services/ai/response-generator.service.js';
import { getAdaptiveThreshold } from '@services/ai/nlu.threshold.js';
import { BookingService } from '@services/booking/booking.service.js';

import type { AlternativeSuggestion } from '@core/interfaces/booking.types.js';

import { prisma } from '@infra/database/prisma.client.js';

import { logger } from '@utils/logger.js';

import type { WAEvent } from '../../types/index.js';

import { ConversationStateMachine } from './state-machine.js';
import { getState, newEmptyState, setStateCAS } from './state-store.js';
import type { BookingProposal, ConversationEvent, ConversationState } from './state.types.js';

export class ConversationService {
  private readonly ttlMinutes = 20;

  constructor(
    private readonly nlu = new EnhancedNLUService(),
    private readonly responder = new ResponseGenerator(),
    private readonly booking = new BookingService(),
  ) {}

  async processMessage(event: WAEvent): Promise<{ replyText: string }> {
    const message = event.message || '';

    if (process.env.NODE_ENV !== 'production') {
      const devHandled = await this.tryHandleDevCommand(message);
      if (devHandled) {
        return devHandled;
      }
    }

    const tenant = await this.loadTenant(event.tenantId);
    if (!tenant) {
      logger.error('[conv] tenant not found', { tenantId: event.tenantId });
      return { replyText: 'Al momento non riesco a trovare le informazioni del locale.' };
    }

    const persisted = await getState(event.tenantId, event.userPhone);
    const expectedVersion = persisted ? persisted.version : null;
    const currentState = persisted ?? newEmptyState();

    const threshold = await getAdaptiveThreshold(event.tenantId);
    const stateMachine = new ConversationStateMachine(this.ttlMinutes, threshold);

    const nlu = await this.nlu.parseWithContext(message, currentState, tenant);

    const reduceEvent: ConversationEvent = {
      type: 'USER_MESSAGE',
      payload: { text: message, nlu, tenantId: event.tenantId },
    };

    const { state: nextState, effects, warnings } = stateMachine.reduce(currentState, reduceEvent);
    if (warnings?.length) {
      logger.warn('[conv] reducer warnings', { tenantId: event.tenantId, warnings });
    }

    let reply: string | null = null;

    for (const effect of effects) {
      switch (effect.type) {
        case 'ASK_MISSING':
          reply = await this.responder.askForMissing(tenant, effect.payload?.fields ?? []);
          break;
        case 'RESPOND_TEXT':
          reply = await this.responder.byKey(tenant, effect.payload?.key);
          break;
        case 'PROPOSE_BOOKING': {
          const proposal = effect.payload?.proposal as BookingProposal | undefined;
          if (!proposal) {
            reply = await this.responder.byKey(tenant, 'generic_error');
            break;
          }
          reply = await this.responder.propose(
            tenant,
            proposal,
            effect.payload?.pendingActionId ?? '',
          );
          break;
        }
        case 'CONFIRM_BOOKING':
          reply = await this.handleCreateConfirmation(tenant, event, effect.payload, nextState);
          break;
        case 'MODIFY_BOOKING':
          reply = await this.handleModifyConfirmation(tenant, event, effect.payload, nextState);
          break;
        case 'CANCEL_BOOKING':
          reply = await this.handleCancelConfirmation(tenant, event, effect.payload, nextState);
          break;
        default:
          break;
      }
    }

    if (!reply) {
      reply = await this.responder.byKey(tenant, 'generic_fallback');
    }

    nextState.version = (currentState.version ?? 0) + 1;
    const cas = await setStateCAS(event.tenantId, event.userPhone, nextState, expectedVersion);
    if (cas !== 'ok') {
      logger.warn('[conv] state CAS failed', { tenantId: event.tenantId, cas });
    }

    return { replyText: reply };
  }

  private async handleCreateConfirmation(
    tenant: Tenant,
    event: WAEvent,
    payload: { proposal: BookingProposal; pendingActionId?: string } | undefined,
    nextState: ConversationState,
  ): Promise<string> {
    try {
      const proposal = payload?.proposal;
      if (!proposal) {
        return this.responder.byKey(tenant, 'generic_error');
      }
      const startISO = this.responder.resolveStartISOFromProposal(proposal, tenant);
      const endISO = this.responder.resolveEndISOFromProposal(proposal, tenant);
      const created = await this.booking.createBooking({
        tenantId: tenant.id,
        name: proposal?.name,
        people: proposal?.people,
        startAtISO: startISO,
        endAtISO: endISO,
        userPhone: event.userPhone,
      });
      nextState.flow = 'IDLE';
      nextState.context = {};
      nextState.pendingAction = undefined;
      return this.responder.confirmed(tenant, created, payload?.pendingActionId ?? '');
    } catch (err) {
      logger.error('[conv] booking confirmation failed', { err: this.serializeError(err) });
      const alternatives = (err as any)?.data?.alternatives as AlternativeSuggestion[] | undefined;
      nextState.flow = 'GATHERING_INFO';
      nextState.pendingAction = undefined;
      if (alternatives && alternatives.length > 0) {
        return this.responder.conflictWithAlternatives(tenant, alternatives);
      }
      return this.responder.byKey(tenant, 'generic_error');
    }
  }

  private async handleModifyConfirmation(
    tenant: Tenant,
    _event: WAEvent,
    payload: { proposal: BookingProposal; pendingActionId?: string } | undefined,
    nextState: ConversationState,
  ): Promise<string> {
    try {
      const proposal = payload?.proposal;
      const bookingRef: string | undefined = proposal?.bookingRef;
      if (!bookingRef) {
        return this.responder.byKey(tenant, 'missing_fields');
      }

      const patch: {
        name?: string;
        people?: number;
        startAtISO?: string;
        endAtISO?: string;
      } = {};
      if (proposal?.name) patch.name = proposal.name;
      if (typeof proposal?.people === 'number' && proposal.people > 0) {
        patch.people = proposal.people;
      }
      if (proposal?.dateISO || proposal?.timeISO || proposal?.partOfDay) {
        patch.startAtISO = this.responder.resolveStartISOFromProposal(proposal, tenant);
        patch.endAtISO = this.responder.resolveEndISOFromProposal(proposal, tenant);
      }

      if (Object.keys(patch).length === 0) {
        return this.responder.byKey(tenant, 'nothing_to_confirm');
      }

      const modified = await this.booking.modifyBooking({
        id: bookingRef,
        tenantId: tenant.id,
        patch,
      });
      nextState.flow = 'IDLE';
      nextState.context = {};
      nextState.pendingAction = undefined;
      return this.responder.modified(tenant, modified, payload?.pendingActionId ?? '');
    } catch (err) {
      logger.error('[conv] booking modify failed', { err: this.serializeError(err) });
      const alternatives = (err as any)?.data?.alternatives as AlternativeSuggestion[] | undefined;
      nextState.flow = 'GATHERING_INFO';
      nextState.pendingAction = undefined;
      if (alternatives && alternatives.length > 0) {
        return this.responder.conflictWithAlternatives(tenant, alternatives);
      }
      return this.responder.byKey(tenant, 'generic_error');
    }
  }

  private async handleCancelConfirmation(
    tenant: Tenant,
    _event: WAEvent,
    payload: { proposal: BookingProposal; pendingActionId?: string } | undefined,
    nextState: ConversationState,
  ): Promise<string> {
    try {
      const proposal = payload?.proposal;
      const bookingRef: string | undefined = proposal?.bookingRef;
      if (!bookingRef) {
        return this.responder.byKey(tenant, 'missing_fields');
      }
      const cancelled = await this.booking.cancelBooking(bookingRef, tenant.id);
      nextState.flow = 'IDLE';
      nextState.context = {};
      nextState.pendingAction = undefined;
      return this.responder.cancelled(tenant, cancelled, payload?.pendingActionId ?? '');
    } catch (err) {
      logger.error('[conv] booking cancel failed', { err: this.serializeError(err) });
      nextState.flow = 'GATHERING_INFO';
      nextState.pendingAction = undefined;
      return this.responder.byKey(tenant, 'generic_error');
    }
  }

  private async loadTenant(tenantId: string): Promise<Tenant | null> {
    if (!tenantId) return null;
    return (
      ((await (prisma as any).tenant.findUnique({ where: { id: tenantId } })) as Tenant | null) ??
      null
    );
  }

  private serializeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
      return { message: err.message, name: err.name, stack: err.stack };
    }
    if (typeof err === 'object' && err) {
      return err as Record<string, unknown>;
    }
    return { message: String(err) };
  }

  private async tryHandleDevCommand(message: string): Promise<{ replyText: string } | null> {
    if (!message) return null;
    try {
      if (message.startsWith('CREATE:')) {
        const payload = JSON.parse(message.slice('CREATE:'.length));
        const created = await this.booking.createBooking(payload as any);
        return { replyText: `created: ${created.id}` };
      }
      if (message.startsWith('MODIFY:')) {
        const payload = JSON.parse(message.slice('MODIFY:'.length));
        const modified = await this.booking.modifyBooking(payload as any);
        return { replyText: `modified: ${modified.id}` };
      }
      if (message.startsWith('CANCEL:')) {
        const payload = JSON.parse(message.slice('CANCEL:'.length));
        const cancelled = await this.booking.cancelBooking(payload.id, payload.tenantId);
        return { replyText: `cancelled: ${cancelled.id}` };
      }
      if (message.startsWith('GETBYID:')) {
        const payload = JSON.parse(message.slice('GETBYID:'.length));
        const found = await this.booking.getBookingById(payload.tenantId, payload.id);
        return { replyText: JSON.stringify(found) };
      }
      if (message.startsWith('GETBYUSER:')) {
        const payload = JSON.parse(message.slice('GETBYUSER:'.length));
        const found = await this.booking.getBookingsByUser(payload.tenantId, payload.userPhone);
        return { replyText: JSON.stringify(found) };
      }
    } catch (err) {
      return { replyText: `error: ${(err as Error).message}` };
    }
    return null;
  }
}
