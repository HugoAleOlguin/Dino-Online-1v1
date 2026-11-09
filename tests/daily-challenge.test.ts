import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCurrentDateUtc,
  getDailySeed,
  loadDailyState,
  saveDailyState,
  recordDailyRun,
  formatDailyShareText,
  formatScoreWithDots,
  copyTextToClipboard,
  DailyChallengeState,
  DAILY_TARGET_SCORE,
} from '../src/core/daily-challenge';

describe('Daily Challenge Core Engine', () => {
  let mockStorage: Record<string, string>;
  let storageShim: Storage;

  beforeEach(() => {
    mockStorage = {};
    storageShim = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (i: number) => Object.keys(mockStorage)[i] || null,
      length: 0,
    };
  });

  describe('getCurrentDateUtc', () => {
    it('returns ISO YYYY-MM-DD based strictly on UTC time', () => {
      // 2026-11-09 23:30:00 in UTC-3 is 2026-11-10 02:30:00 in UTC
      const date = new Date('2026-11-10T02:30:00.000Z');
      expect(getCurrentDateUtc(date)).toBe('2026-11-10');
    });
  });

  describe('getDailySeed', () => {
    it('is strictly deterministic for identical UTC date strings', () => {
      const seed1 = getDailySeed('2026-11-09');
      const seed2 = getDailySeed('2026-11-09');
      expect(seed1).toBe(seed2);
      expect(seed1).toBeGreaterThan(0);
      expect(Number.isInteger(seed1)).toBe(true);
    });

    it('generates distinct seeds for different dates', () => {
      const s1 = getDailySeed('2026-11-09');
      const s2 = getDailySeed('2026-11-10');
      const s3 = getDailySeed('2026-12-09');
      expect(s1).not.toBe(s2);
      expect(s2).not.toBe(s3);
    });
  });

  describe('Storage & Schema Resilience', () => {
    it('initializes clean state if key does not exist', () => {
      const state = loadDailyState('2026-11-09', storageShim);
      expect(state.dateUtc).toBe('2026-11-09');
      expect(state.targetScore).toBe(DAILY_TARGET_SCORE);
      expect(state.attempts).toEqual([]);
      expect(state.completed).toBe(false);
      expect(state.completedInAttempt).toBeNull();
      expect(state.bestOfficialScore).toBe(0);
    });

    it('recovers gracefully from corrupted JSON in localStorage', () => {
      mockStorage['dino_daily_2026-11-09'] = '{corrupted_json:::invalid';
      const state = loadDailyState('2026-11-09', storageShim);
      expect(state.dateUtc).toBe('2026-11-09');
      expect(state.attempts).toEqual([]);
      expect(state.bestOfficialScore).toBe(0);
    });

    it('recovers gracefully if data has incorrect types or invalid schema', () => {
      mockStorage['dino_daily_2026-11-09'] = JSON.stringify({
        dateUtc: '2026-11-09',
        attempts: 'not-an-array',
        completed: 'maybe',
        bestOfficialScore: 'one-million',
      });
      const state = loadDailyState('2026-11-09', storageShim);
      expect(state.attempts).toEqual([]);
      expect(state.completed).toBe(false);
      expect(state.bestOfficialScore).toBe(0);
    });

    it('saves and reloads state accurately', () => {
      const original: DailyChallengeState = {
        dateUtc: '2026-11-09',
        targetScore: 1000,
        attempts: [420, 1050],
        completed: true,
        completedInAttempt: 2,
        bestOfficialScore: 1050,
      };
      saveDailyState(original, storageShim);
      const loaded = loadDailyState('2026-11-09', storageShim);
      expect(loaded).toEqual(original);
    });
  });

  describe('recordDailyRun', () => {
    it('records first attempt as official and updates best score', () => {
      const initial = loadDailyState('2026-11-09', storageShim);
      const { newState, isOfficial } = recordDailyRun(initial, 450);

      expect(isOfficial).toBe(true);
      expect(newState.attempts).toEqual([450]);
      expect(newState.bestOfficialScore).toBe(450);
      expect(newState.completed).toBe(false);
      expect(newState.completedInAttempt).toBeNull();
    });

    it('marks completed on the first attempt that reaches or exceeds 1000 pts', () => {
      let state = loadDailyState('2026-11-09', storageShim);
      state = recordDailyRun(state, 300).newState; // Intento 1
      state = recordDailyRun(state, 1050).newState; // Intento 2

      expect(state.attempts).toEqual([300, 1050]);
      expect(state.completed).toBe(true);
      expect(state.completedInAttempt).toBe(2);
      expect(state.bestOfficialScore).toBe(1050);

      // Intento 3 with even higher score
      state = recordDailyRun(state, 1340).newState;
      expect(state.attempts).toEqual([300, 1050, 1340]);
      expect(state.completed).toBe(true);
      expect(state.completedInAttempt).toBe(2); // Inmutable: fue completado en el 2
      expect(state.bestOfficialScore).toBe(1340); // Actualiza mejor marca oficial
    });

    it('enforces 3 official attempts max; 4th and beyond are practice', () => {
      let state = loadDailyState('2026-11-09', storageShim);
      state = recordDailyRun(state, 100).newState; // 1
      state = recordDailyRun(state, 200).newState; // 2
      state = recordDailyRun(state, 300).newState; // 3
      expect(state.attempts).toHaveLength(3);
      expect(state.bestOfficialScore).toBe(300);

      // Attempt 4: Practice mode
      const result4 = recordDailyRun(state, 2500);
      expect(result4.isOfficial).toBe(false);
      expect(result4.newState.attempts).toEqual([100, 200, 300]);
      expect(result4.newState.bestOfficialScore).toBe(300); // Does NOT change official best
      expect(result4.newState.completed).toBe(false); // Does NOT alter completion
    });
  });

  describe('formatDailyShareText', () => {
    it('formats clean share card when target is achieved', () => {
      const state: DailyChallengeState = {
        dateUtc: '2026-11-09',
        targetScore: 1000,
        attempts: [420, 1050, 1340],
        completed: true,
        completedInAttempt: 2,
        bestOfficialScore: 1340,
      };

      const card = formatDailyShareText(state);
      expect(card).toContain('🦖 Dino Online — Desafío Diario · 09/11/2026');
      expect(card).toContain('Mejor marca: 1.340 pts');
      expect(card).toContain('Meta de 1.000: ¡Superada!');
      expect(card).toContain('https://dino-online-1v1.vercel.app');
      // Must NOT contain clutter of attempts
      expect(card).not.toContain('1️⃣');
      expect(card).not.toContain('Intento 1');
    });

    it('formats clean share card when target is NOT achieved after 3 attempts', () => {
      const state: DailyChallengeState = {
        dateUtc: '2026-11-09',
        targetScore: 1000,
        attempts: [320, 580, 890],
        completed: false,
        completedInAttempt: null,
        bestOfficialScore: 890,
      };

      const card = formatDailyShareText(state);
      expect(card).toContain('🦖 Dino Online — Desafío Diario · 09/11/2026');
      expect(card).toContain('Mejor marca: 890 pts');
      expect(card).toContain('Meta de 1.000: No alcanzada');
      expect(card).toContain('https://dino-online-1v1.vercel.app');
    });

    it('formats clean share card if shared after only 1 attempt', () => {
      const state: DailyChallengeState = {
        dateUtc: '2026-11-09',
        targetScore: 1000,
        attempts: [420],
        completed: false,
        completedInAttempt: null,
        bestOfficialScore: 420,
      };

      const card = formatDailyShareText(state);
      expect(card).toContain('🦖 Dino Online — Desafío Diario · 09/11/2026');
      expect(card).toContain('Mejor marca: 420 pts');
      expect(card).toContain('Meta de 1.000: No alcanzada');
    });
  });

  describe('copyTextToClipboard & formatScoreWithDots', () => {
    it('formats score with thousands separator dots in Spanish', () => {
      expect(formatScoreWithDots(0)).toBe('0');
      expect(formatScoreWithDots(450)).toBe('450');
      expect(formatScoreWithDots(1000)).toBe('1.000');
      expect(formatScoreWithDots(12345)).toBe('12.345');
    });

    it('handles clipboard safely without throwing in test environment', async () => {
      const res = await copyTextToClipboard('test share text');
      expect(typeof res).toBe('boolean');
    });
  });
});
