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
      'Analizza il messaggio utente e restituisci SOLO un oggetto JSON conforme allo schema v2:',
    );
    lines.push('{');
    lines.push(
      '  "intent": string UPPERCASE ∈ {CREATE_BOOKING, MODIFY_BOOKING, CANCEL_BOOKING, GET_INFORMATION, CONFIRMATION, UNKNOWN};',
    );
    lines.push('  "confidence": numero tra 0 e 1;');
    lines.push('  "entities": oggetto con gli slot estratti ({} se nessuno);');
    lines.push('  "missing": array di stringhe con gli slot mancanti ([] se nessuno);');
    lines.push('  "ambiguity": array di stringhe con dubbi/ambiguità ([] se nessuno);');
    lines.push('  "warnings": array di stringhe con eventuali note aggiuntive ([] se nessuna).');
    lines.push('}');
    lines.push('Se non sei sicuro dell\'intento usa "UNKNOWN" con confidence 0.0.');
    lines.push(
      'Estrai e normalizza espressioni temporali italiane (oggi, domani, dopodomani, stasera, domani sera, alle 20, tra 30 minuti) in ISO 8601 nel fuso orario indicato.',
    );
    lines.push('Esempi:');
    lines.push(
      'domani alle 20 per 4, sono Marco -> {"intent":"CREATE_BOOKING","confidence":0.9,"entities":{"name":"Marco","people":4,"startAt":"<ISO>","endAt":"<ISO>"},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'puoi spostare a domani? -> {"intent":"MODIFY_BOOKING","confidence":0.8,"entities":{},"missing":["startAt"],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'annulla la prenotazione a nome Marco -> {"intent":"CANCEL_BOOKING","confidence":0.9,"entities":{"name":"Marco"},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'siete aperti domani? -> {"intent":"GET_INFORMATION","confidence":0.7,"entities":{"date":"<ISO_DATE>"},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push(
      'va bene, confermo -> {"intent":"CONFIRMATION","confidence":0.95,"entities":{},"missing":[],"ambiguity":[],"warnings":[]}',
    );
    lines.push('---');
    lines.push(`Utente: ${message}`);
    lines.push('Risposta JSON:');
    return lines.join('\n');
  }
}
