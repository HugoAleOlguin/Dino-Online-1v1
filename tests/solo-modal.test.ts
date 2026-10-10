import { describe, it, expect } from 'vitest';
import { formatSoloModalDisplay } from '../src/core/lobby-helpers';

describe('formatSoloModalDisplay', () => {
  it('should format new personal record cleanly without duplicate text', () => {
    const result = formatSoloModalDisplay(500, 300);
    expect(result.distanceText).toBe('DISTANCIA: 500 METROS');
    expect(result.statusText).toBe('¡NUEVO RECORD PERSONAL!');
    expect(result.showSeriesBadge).toBe(false);
  });

  it('should format normal run below highscore without duplicate record labels', () => {
    const result = formatSoloModalDisplay(250, 400);
    expect(result.distanceText).toBe('DISTANCIA: 250 METROS');
    expect(result.statusText).toBe('RECORD: 400 METROS');
    expect(result.showSeriesBadge).toBe(false);
  });

  it('should handle zero highscore first game', () => {
    const result = formatSoloModalDisplay(100, 0);
    expect(result.distanceText).toBe('DISTANCIA: 100 METROS');
    expect(result.statusText).toBe('¡NUEVO RECORD PERSONAL!');
    expect(result.showSeriesBadge).toBe(false);
  });
});
