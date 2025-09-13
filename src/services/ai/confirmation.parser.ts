export class ConfirmationParser {
  parse(input: string): boolean | null {
    const normalized = input
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim()
      .replace(/\s+/g, ' ');

    const positives = new Set([
      'si',
      'ok',
      'va bene',
      'perfetto',
      'confermo',
      'confermata',
      'certo',
      'assolutamente',
      'procedi',
      'vai',
    ]);

    const negatives = new Set([
      'no',
      'non va bene',
      'annulla',
      'cancella',
      'negativo',
      'non confermo',
      'rifiuto',
    ]);

    if (positives.has(normalized)) return true;
    if (negatives.has(normalized)) return false;
    return null;
  }
}
