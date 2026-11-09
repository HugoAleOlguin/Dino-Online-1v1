import { describe, it, expect } from 'vitest';
import { formatSoloModalDisplay } from '../src/core/lobby-helpers';

describe('formatSoloModalDisplay', () => {
  it('should format new personal record cleanly without duplicate text', () => {
    const result = formatSoloModalDisplay(500, 300);
    expect(result.distanceText).toBe('PUNTAJE: 500 PTS');
    expect(result.statusText).toBe('¡NUEVO RÉCORD!');
    expect(result.showSeriesBadge).toBe(false);
  });

  it('should format normal run below highscore without duplicate record labels', () => {
    const result = formatSoloModalDisplay(250, 400);
    expect(result.distanceText).toBe('PUNTAJE: 250 PTS');
    expect(result.statusText).toBe('RÉCORD: 400 PTS');
    expect(result.showSeriesBadge).toBe(false);
  });

  it('should handle zero highscore first game', () => {
    const result = formatSoloModalDisplay(100, 0);
    expect(result.distanceText).toBe('PUNTAJE: 100 PTS');
    expect(result.statusText).toBe('¡NUEVO RÉCORD!');
    expect(result.showSeriesBadge).toBe(false);
  });
});
