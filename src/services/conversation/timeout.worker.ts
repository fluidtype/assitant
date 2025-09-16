import { DateTime } from 'luxon';
import type { Tenant } from '@prisma/client';

import { ResponseGenerator } from '@services/ai/response-generator.service.js';
import { WhatsAppService } from '@services/messaging/whatsapp.service.js';

import { prisma } from '@infra/database/prisma.client.js';
import { redis } from '@infra/redis/redis.client.js';

import { logger } from '@utils/logger.js';

import type { ConversationState } from './state.types.js';
import { ConversationStateMachine } from './state-machine.js';
import { getState, setStateCAS } from './state-store.js';

const sm = new ConversationStateMachine(20, 0.6);
const responder = new ResponseGenerator();
const whatsapp = new WhatsAppService();

interface ParsedKey {
  tenantId: string;
  phone: string;
}

function parseKey(key: string): ParsedKey | null {
  const [, tenantId, ...rest] = key.split(':');
  if (!tenantId || rest.length === 0) {
    return null;
  }
  return { tenantId, phone: rest.join(':') };
}

async function dispatchTimeoutEffects(
  tenantId: string,
  phone: string,
  effects: ReturnType<ConversationStateMachine['reduce']>['effects'],
) {
  if (!effects || effects.length === 0) return;
  const tenant = (await (prisma as any).tenant.findUnique({
    where: { id: tenantId },
  })) as Tenant | null;
  if (!tenant) {
    logger.warn('[timeout] tenant not found for timeout notification', { tenantId });
    return;
  }
  for (const effect of effects) {
    if (effect.type !== 'RESPOND_TEXT') continue;
    const key = effect.payload?.key ?? 'timeout_reset';
    try {
      const text = await responder.byKey(tenant, key);
      await whatsapp.sendMessage(phone, text);
    } catch (err) {
      logger.error('[timeout] failed to send timeout notification', {
        tenantId,
        phone,
        key,
        err,
      });
    }
  }
}

export async function scanAndTimeout(prefix = 'conv:*') {
  for await (const key of redis.scanIterator({ MATCH: prefix, COUNT: 200 })) {
    if (typeof key !== 'string') continue;
    const parsed = parseKey(key);
    if (!parsed) continue;

    const state = await getState(parsed.tenantId, parsed.phone);
    if (!state) continue;

    try {
      await handleStateTimeout(key, parsed, state);
    } catch (err) {
      logger.error('[timeout] failed to process state', { key, err });
    }
  }
}

async function handleStateTimeout(key: string, parsed: ParsedKey, state: ConversationState) {
  const updatedAt = DateTime.fromISO(state.updatedAt);
  if (!updatedAt.isValid) return;

  const minutes = DateTime.now().diff(updatedAt, 'minutes').minutes;
  if (minutes <= 20) return;
  if (state.flow !== 'CONFIRMING_ACTION') return;

  const { state: nextState, effects } = sm.reduce(state, {
    type: 'TIMEOUT',
    at: new Date().toISOString(),
  });

  nextState.version = (state.version ?? 0) + 1;

  const result = await setStateCAS(parsed.tenantId, parsed.phone, nextState, state.version ?? null);
  if (result !== 'ok') {
    logger.warn('[timeout] CAS failed', {
      key,
      tenantId: parsed.tenantId,
      phone: parsed.phone,
      result,
    });
    return;
  }

  await dispatchTimeoutEffects(parsed.tenantId, parsed.phone, effects);
}
