const FALLBACK_WHEN_QUICK_REPLIES = {
  en: ['Tonight', 'Tomorrow', 'See more times'],
  it: ['Stasera', 'Domani', 'Vedi altri orari'],
} as const;

type LocaleKey = keyof typeof FALLBACK_WHEN_QUICK_REPLIES;

type QuickReplyKey = 'when';

const DEFAULT_LOCALE: LocaleKey = 'it';
const ENGLISH_PREFIX = 'en';

function normalizeLocale(locale?: string): LocaleKey {
  if (!locale) return DEFAULT_LOCALE;
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith(ENGLISH_PREFIX)) {
    return 'en';
  }
  return DEFAULT_LOCALE;
}

function cloneReplies(replies: readonly string[]): string[] {
  return replies.slice();
}

export function getFallbackQuickReplies(key: QuickReplyKey, locale?: string): string[] {
  const resolved = normalizeLocale(locale);
  switch (key) {
    case 'when':
    default:
      return cloneReplies(FALLBACK_WHEN_QUICK_REPLIES[resolved]);
  }
}

export function resolveLocale(locale?: string): string {
  return locale?.trim() || 'it-IT';
}
