import { redis } from '@infra/redis/redis.client.js';

const KEY_PREFIX = 'nlu:calib:';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRY_SECONDS = 3 * 24 * 60 * 60;
const DEFAULT_ACCURACY = 0.75;
const MIN_THRESHOLD = 0.45;
const MAX_THRESHOLD = 0.75;
const BASE_THRESHOLD = 0.7;
const ADJUSTMENT_FACTOR = 0.3;
const LIST_MAX_LENGTH = 200;

type CalibrationSample = {
  ts: number;
  ok: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeThreshold(accuracy: number): number {
  const adjustment = (accuracy - BASE_THRESHOLD) * ADJUSTMENT_FACTOR;
  return clamp(BASE_THRESHOLD - adjustment, MIN_THRESHOLD, MAX_THRESHOLD);
}

async function ensureRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function recordCalibrationSample(tenantId: string, ok: boolean): Promise<void> {
  if (!tenantId) return;

  const key = `${KEY_PREFIX}${tenantId}`;
  const sample: CalibrationSample = { ts: Date.now(), ok: Boolean(ok) };

  try {
    await ensureRedis();
    await redis.lPush(key, JSON.stringify(sample));
    await redis.lTrim(key, 0, LIST_MAX_LENGTH - 1);
    await redis.expire(key, EXPIRY_SECONDS);
  } catch {
    // Swallow telemetry errors to keep flow resilient
  }
}

export async function getAdaptiveThreshold(tenantId: string): Promise<number> {
  if (!tenantId) {
    return computeThreshold(DEFAULT_ACCURACY);
  }

  try {
    await ensureRedis();
    const key = `${KEY_PREFIX}${tenantId}`;
    const rawSamples = await redis.lRange(key, 0, LIST_MAX_LENGTH - 1);
    if (!rawSamples || rawSamples.length === 0) {
      return computeThreshold(DEFAULT_ACCURACY);
    }

    const cutoff = Date.now() - WINDOW_MS;
    let total = 0;
    let success = 0;

    for (const raw of rawSamples) {
      try {
        const parsed = JSON.parse(raw) as CalibrationSample;
        if (!parsed || typeof parsed.ts !== 'number') {
          continue;
        }
        if (parsed.ts < cutoff) {
          continue;
        }
        total += 1;
        if (parsed.ok) {
          success += 1;
        }
      } catch {
        continue;
      }
    }

    if (total === 0) {
      return computeThreshold(DEFAULT_ACCURACY);
    }

    const accuracy = success / total;
    return computeThreshold(accuracy);
  } catch {
    return computeThreshold(DEFAULT_ACCURACY);
  }
}
