import { describe, it, expect, beforeEach } from 'vitest';
import { SessionScoreTracker } from '../src/core/session-score';

describe('SessionScoreTracker (TDD)', () => {
  let tracker: SessionScoreTracker;

  beforeEach(() => {
    tracker = new SessionScoreTracker();
  });

  it('initializes with 0 - 0 wins', () => {
    expect(tracker.getScore()).toEqual({ localWins: 0, remoteWins: 0 });
    expect(tracker.formatBadge('Dino', 'Rex')).toBe('TÚ: 0  |  REX: 0');
  });

  it('increments local wins and remote wins accurately', () => {
    tracker.recordWin('local');
    tracker.recordWin('local');
    tracker.recordWin('remote');

    expect(tracker.getScore()).toEqual({ localWins: 2, remoteWins: 1 });
    expect(tracker.formatBadge('Dino', 'Bot')).toBe('TÚ: 2  |  BOT: 1');
  });

  it('resets score only on explicit reset (e.g. exit to main menu)', () => {
    tracker.recordWin('local');
    expect(tracker.getScore().localWins).toBe(1);

    tracker.reset();
    expect(tracker.getScore()).toEqual({ localWins: 0, remoteWins: 0 });
  });

  it('handles mutual rematch 1/2 states and messages', () => {
    // Neither ready
    const s0 = tracker.formatRematchState(false, false, false);
    expect(s0.buttonText).toBe('REVANCHA');
    expect(s0.isAllReady).toBe(false);

    // Local confirmed, waiting for remote
    const s1 = tracker.formatRematchState(true, false, false);
    expect(s1.buttonText).toBe('ESPERANDO RIVAL (1/2)');
    expect(s1.statusText).toContain('Esperando');
    expect(s1.isAllReady).toBe(false);

    // Local confirmed, but remote is in lobby
    const s1Lobby = tracker.formatRematchState(true, false, true);
    expect(s1Lobby.buttonText).toBe('ESPERANDO RIVAL (1/2)');
    expect(s1Lobby.statusText).toContain('lobby');
    expect(s1Lobby.isAllReady).toBe(false);

    // Remote confirmed first
    const s2 = tracker.formatRematchState(false, true, false);
    expect(s2.buttonText).toBe('ACEPTAR REVANCHA (1/2)');
    expect(s2.statusText).toContain('rival');
    expect(s2.isAllReady).toBe(false);

    // Both confirmed
    const s3 = tracker.formatRematchState(true, true, false);
    expect(s3.buttonText).toBe('¡LISTOS! (2/2)');
    expect(s3.isAllReady).toBe(true);
  });
});
