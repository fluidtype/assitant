import type { ConversationState } from './state.types.js';

export function assertInvariants(state: ConversationState): string[] {
  const issues: string[] = [];
  if (state.flow === 'CONFIRMING_ACTION') {
    const pending = state.pendingAction;
    if (!pending || !pending.proposal) {
      issues.push('pendingAction_required');
    } else {
      const { proposal } = pending;
      if (!proposal.name) {
        issues.push('name_required');
      }
      if (!proposal.people && pending.type !== 'CANCEL') {
        issues.push('people_required');
      }
      if (!proposal.dateISO) {
        issues.push('date_required');
      }
      if (!proposal.timeISO && !proposal.partOfDay && pending.type !== 'CANCEL') {
        issues.push('time_or_partOfDay_required');
      }
    }
  }
  return issues;
}
