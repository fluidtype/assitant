import { setTimeout as sleep } from 'timers/promises';

export interface RetryOptions {
  retries?: number;
  base?: number;
  max?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 4, base = 250, max = 8000 } = options;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      const delay = computeDelay(attempt, base, max);
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry operation failed');
}

function computeDelay(attempt: number, base: number, max: number): number {
  const exponential = base * 2 ** attempt;
  const capped = Math.min(max, exponential);
  const jitter = capped / 2 + Math.random() * (capped / 2);
  const delay = Math.max(base, Math.min(max, Math.round(jitter)));
  return delay;
}

function shouldRetry(error: unknown): boolean {
  const status = extractStatus(error);
  if (status === null) return false;
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function extractStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidateStatuses: unknown[] = [];
  const err = error as Record<string, unknown>;

  if (typeof err.status !== 'undefined') {
    candidateStatuses.push(err.status);
  }

  const response = err.response as Record<string, unknown> | undefined;
  if (response && typeof response.status !== 'undefined') {
    candidateStatuses.push(response.status);
  }

  if (typeof err.code !== 'undefined') {
    candidateStatuses.push(err.code);
  }

  for (const candidate of candidateStatuses) {
    const parsed = parseStatus(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function parseStatus(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}
