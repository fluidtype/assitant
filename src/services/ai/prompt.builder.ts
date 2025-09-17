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
      'Analizza il messaggio utente seguente e restituisci SOLO un oggetto JSON con chiavi intent, confidence, entities, missing, ambiguity, warnings.',
    );
    lines.push(
      'intent deve essere una stringa UPPERCASE ∈ {CREATE_BOOKING, MODIFY_BOOKING, CANCEL_BOOKING, GET_INFO, CONFIRM_BOOKING, UNKNOWN}.',
    );
    lines.push('confidence è un numero tra 0 e 1.');
    lines.push(
      'entities è un oggetto che mappa i nomi degli slot agli oggetti estratti; se assenti usa {}.',
    );
    lines.push('missing è un array di stringhe con gli slot indispensabili mancanti.');
    lines.push(
      'ambiguity è un array di oggetti che descrivono ambiguità ancora da chiarire (usa field + options).',
    );
    lines.push('warnings è un array di stringhe; se nessun warning usa [].');

    lines.push(
      'Estrai e normalizza espressioni temporali italiane (oggi, domani, dopodomani, stasera, domani sera, alle 20, tra 30 minuti) in ISO 8601 nel fuso orario indicato.',
    );
    lines.push('Esempi:');
    lines.push(
      'domani alle 20 per 4, sono Marco -> {"intent":"CREATE_BOOKING","confidence":0.9,"entities":{"name":{"value":"Marco"},"people":{"value":4},"when":{"value":{"startAt":"2025-09-19T20:00:00+02:00","endAt":"2025-09-19T22:00:00+02:00"}}},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'puoi spostare la prenotazione di Marco a domani sera -> {"intent":"MODIFY_BOOKING","confidence":0.85,"entities":{"name":{"value":"Marco"},"when":{"value":{"startAt":"2025-09-19T20:00:00+02:00","endAt":"2025-09-19T22:00:00+02:00"}}},"missing":["bookingId"],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'annulla la prenotazione abc123 -> {"intent":"CANCEL_BOOKING","confidence":0.92,"entities":{"bookingId":{"value":"abc123"}},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'siete aperti domani? -> {"intent":"GET_INFO","confidence":0.8,"entities":{},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'va bene, confermo -> {"intent":"CONFIRM_BOOKING","confidence":0.75,"entities":{},"missing":[],"ambiguity":[],"warnings":[]}',

    );
    lines.push('---');
    lines.push(`Utente: ${message}`);
    lines.push('Risposta JSON:');
    return lines.join('\n');
  }
}
