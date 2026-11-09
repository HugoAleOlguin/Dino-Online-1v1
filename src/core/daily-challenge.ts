/**
 * Daily Challenge Engine (Modo Desafío Diario)
 *
 * Implements deterministic daily tracks based on UTC date,
 * strict 3-attempt lifecycle, resilient local persistence,
 * and simplified Wordle-style clean text card sharing.
 */

export const DAILY_TARGET_SCORE = 1000;
export const MAX_OFFICIAL_ATTEMPTS = 3;
export const DAILY_STORAGE_PREFIX = 'dino_daily_';

export interface DailyChallengeState {
  dateUtc: string; // Format "YYYY-MM-DD" in UTC
  targetScore: number; // 1000
  attempts: number[]; // Official attempt scores [int1, int2, int3]; length 0..3
  completed: boolean; // true if any official attempt >= targetScore
  completedInAttempt: number | null; // 1, 2, 3 or null
  bestOfficialScore: number; // Math.max(...attempts, 0)
}

/**
 * Returns current UTC date formatted as "YYYY-MM-DD".
 */
export function getCurrentDateUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Generates a positive 32-bit deterministic integer seed from a UTC date string
 * using FNV-1a non-linear hashing for cross-browser, cross-OS consistency.
 */
export function getDailySeed(dateUtc: string): number {
  let hash = 2166136261;
  for (let i = 0; i < dateUtc.length; i++) {
    hash ^= dateUtc.charCodeAt(i);
    // 32-bit FNV prime multiplication
    hash = Math.imul(hash, 16777619);
  }
  // Ensure positive signed 32-bit integer (> 0)
  return (hash >>> 0) || 123456789;
}

/**
 * Loads and validates DailyChallengeState from localStorage for given dateUtc.
 * Self-heals corrupted JSON or schema drift to avoid application crashes.
 */
export function loadDailyState(dateUtc: string, storage: Storage = window.localStorage): DailyChallengeState {
  const defaultState: DailyChallengeState = {
    dateUtc,
    targetScore: DAILY_TARGET_SCORE,
    attempts: [],
    completed: false,
    completedInAttempt: null,
    bestOfficialScore: 0,
  };

  try {
    const raw = storage.getItem(`${DAILY_STORAGE_PREFIX}${dateUtc}`);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultState;

    // Validate and sanitize attempts array
    const attempts: number[] = Array.isArray(parsed.attempts)
      ? parsed.attempts
          .map((v: unknown) => (typeof v === 'number' && !isNaN(v) && v >= 0 ? Math.floor(v) : null))
          .filter((v: number | null): v is number => v !== null)
          .slice(0, MAX_OFFICIAL_ATTEMPTS)
      : [];

    const bestOfficialScore = attempts.length > 0 ? Math.max(...attempts) : 0;
    const completed = typeof parsed.completed === 'boolean' ? parsed.completed : bestOfficialScore >= DAILY_TARGET_SCORE;
    
    let completedInAttempt: number | null = null;
    if (typeof parsed.completedInAttempt === 'number' && parsed.completedInAttempt >= 1 && parsed.completedInAttempt <= 3) {
      completedInAttempt = parsed.completedInAttempt;
    } else if (completed) {
      const idx = attempts.findIndex((s: number) => s >= DAILY_TARGET_SCORE);
      if (idx !== -1) completedInAttempt = idx + 1;
    }

    return {
      dateUtc,
      targetScore: DAILY_TARGET_SCORE,
      attempts,
      completed,
      completedInAttempt,
      bestOfficialScore,
    };
  } catch {
    return defaultState;
  }
}

/**
 * Persists valid DailyChallengeState to storage immediately.
 */
export function saveDailyState(state: DailyChallengeState, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(`${DAILY_STORAGE_PREFIX}${state.dateUtc}`, JSON.stringify(state));
  } catch (err) {
    console.warn('[DailyChallenge] Failed to save state to localStorage:', err);
  }
}

/**
 * Records a completed run (at crash/collision) into the daily lifecycle.
 * - If attempts.length < 3: adds to attempts, updates best score, marks completed if applicable.
 * - If attempts.length >= 3: treated as unlimited practice run (isOfficial = false).
 */
export function recordDailyRun(
  state: DailyChallengeState,
  finalScore: number
): { newState: DailyChallengeState; isOfficial: boolean } {
  const safeScore = Math.max(0, Math.floor(finalScore));

  if (state.attempts.length >= MAX_OFFICIAL_ATTEMPTS) {
    // Practice run
    return {
      newState: { ...state },
      isOfficial: false,
    };
  }

  // Official run
  const newAttempts = [...state.attempts, safeScore];
  const newBest = Math.max(state.bestOfficialScore, safeScore);
  const reachedTarget = safeScore >= state.targetScore;

  const completed = state.completed || reachedTarget;
  let completedInAttempt = state.completedInAttempt;
  if (!completedInAttempt && reachedTarget) {
    completedInAttempt = newAttempts.length;
  }

  const newState: DailyChallengeState = {
    ...state,
    attempts: newAttempts,
    bestOfficialScore: newBest,
    completed,
    completedInAttempt,
  };

  return {
    newState,
    isOfficial: true,
  };
}

/**
 * Formats a score into Spanish number formatting (e.g. 1340 -> "1.340").
 */
export function formatScoreWithDots(score: number): string {
  return score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Generates the clean, minimalist share card text requested by design:
 * 🦖 Dino Online — Desafío Diario · DD/MM/YYYY
 * Mejor marca: 1.340 pts
 * Meta de 1.000: ¡Superada!
 * https://dino-online-1v1.vercel.app
 */
export function formatDailyShareText(state: DailyChallengeState): string {
  // Convert YYYY-MM-DD to DD/MM/YYYY
  const parts = state.dateUtc.split('-');
  const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : state.dateUtc;

  const formattedBest = formatScoreWithDots(state.bestOfficialScore);
  const targetFormatted = formatScoreWithDots(state.targetScore);
  const metaStatus = state.completed ? '¡Superada!' : 'No alcanzada';

  return [
    `🦖 Dino Online — Desafío Diario · ${displayDate}`,
    `Mejor marca: ${formattedBest} pts`,
    `Meta de ${targetFormatted}: ${metaStatus}`,
    'https://dino-online-1v1.vercel.app',
  ].join('\n');
}

/**
 * Resilient clipboard writer with fallback for insecure or non-navigator contexts.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window?.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  } catch {}

  return false;
}
