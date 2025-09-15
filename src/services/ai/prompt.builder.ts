import type { ConversationState } from '@services/cache/conversation-cache.js';

import type { TenantEntity } from '@core/entities/tenant.entity.js';

export class PromptBuilder {
  buildPrompt(input: {
    message: string;
    state: ConversationState | null;
    tenant: TenantEntity & { config?: Record<string, unknown>; features?: Record<string, unknown> };
    timezone?: string;
  }): string {
    const { message, state, tenant, timezone = 'Europe/Rome' } = input;
    const cfg = tenant.config ?? {};
    const subset: Record<string, unknown> = {};
    if (cfg.openingHours) subset.openingHours = cfg.openingHours;
    if (cfg.capacity) subset.capacity = cfg.capacity;
    if (cfg.services) subset.services = cfg.services;

    let stateLine = 'Stato conversazione: nessuno';
    if (state) {
      let ctx = '';
      try {
        ctx = JSON.stringify(state.context);
      } catch {
        ctx = String(state.context);
      }
      if (ctx.length > 500) ctx = ctx.slice(0, 500);
      stateLine = `Stato conversazione: flow=${state.flow}, context=${ctx}`;
    }

    const today = new Date().toISOString().split('T')[0];

    const lines: string[] = [];
    lines.push(
      'Sei un parser NLU per prenotazioni su WhatsApp (ristoranti e parrucchieri), multi-tenant.',
    );
    lines.push(
      `Tenant: ${tenant.name}${tenant.features?.vertical ? ` (vertical: ${tenant.features.vertical})` : ''}.`,
    );
    if (Object.keys(subset).length) lines.push(`Config: ${JSON.stringify(subset)}`);
    lines.push(stateLine);
    lines.push(`Data corrente: ${today}`);
    lines.push(`Fuso orario: ${timezone}`);
    lines.push(
      'Analizza il messaggio utente seguente e restituisci SOLO un oggetto JSON con chiavi intent, confidence, slots.',
    );
    lines.push('intent ∈ {create, modify, cancel, get_info, confirmation, unknown}.');
    lines.push('confidence è un numero tra 0 e 1.');
    lines.push('slots è un oggetto con informazioni estratte; se nessuna, usa {} o ometti.');
    lines.push('Se non sei sicuro, usa intent "unknown" e confidence 0.0.');
    lines.push(
      'Estrai e normalizza espressioni temporali italiane (oggi, domani, dopodomani, stasera, domani sera, alle 20, tra 30 minuti) in ISO 8601 nel fuso orario indicato.',
    );
    lines.push('Esempi:');
    lines.push(
      'domani alle 20 per 4, sono Marco -> {"intent":"create","confidence":0.9,"slots":{"name":"Marco","people":4,"startAt":"<ISO>","endAt":"<ISO>"}}',
    );
    lines.push('puoi spostare a domani? -> {"intent":"modify","confidence":0.9,"slots":{}}');
    lines.push(
      'annulla la prenotazione a nome Marco -> {"intent":"cancel","confidence":0.9,"slots":{"name":"Marco"}}',
    );
    lines.push('siete aperti domani? -> {"intent":"get_info","confidence":0.9,"slots":{}}');
    lines.push('va bene, confermo -> {"intent":"confirmation","confidence":0.9,"slots":{}}');
    lines.push('---');
    lines.push(`Utente: ${message}`);
    lines.push('Risposta JSON:');
    return lines.join('\n');
  }
}
