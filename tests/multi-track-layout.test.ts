import { describe, it, expect } from 'vitest';
import { calculateMultiTrackLayout } from '../src/render/ui-helpers';

describe('Multi-Track Canvas Layout & Ceiling Protection (Up to 4 Players)', () => {
  const V_HEIGHT = 540;
  const V_WIDTH = 960;
  const MAX_LOGICAL_JUMP_Y = 124; // Chromium offline.js jump apex
  const DINO_LOGICAL_HEIGHT = 47; // T-Rex standard height

  it('calculates valid layout for 1, 2, 3 and 4 tracks', () => {
    for (let count = 1; count <= 4; count++) {
      const layout = calculateMultiTrackLayout(count, V_HEIGHT, V_WIDTH);
      expect(layout.numTracks).toBe(count);
      expect(layout.groundYs.length).toBe(count);
      expect(layout.topBoundaries.length).toBe(count);
      expect(layout.scale).toBeGreaterThan(0.4);
      expect(layout.scale).toBeLessThanOrEqual(1.0);
    }
  });

  it('guarantees ceiling headroom strictly >= 20px for all tracks with 1-4 players so dinos never clip through ceiling', () => {
    for (let count = 1; count <= 4; count++) {
      const layout = calculateMultiTrackLayout(count, V_HEIGHT, V_WIDTH);
      const scaledApex = MAX_LOGICAL_JUMP_Y * layout.scale;
      const scaledDinoHeight = DINO_LOGICAL_HEIGHT * layout.scale;

      for (let i = 0; i < count; i++) {
        const groundY = layout.groundYs[i];
        const ceilingY = layout.topBoundaries[i];
        const dinoHighestY = groundY - scaledApex - scaledDinoHeight;

        // Headroom: distance between dino head at jump apex and ceiling
        const headroom = dinoHighestY - ceilingY;

        expect(headroom).toBeGreaterThanOrEqual(20);
        expect(groundY).toBeLessThanOrEqual(V_HEIGHT);
        expect(ceilingY).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('maintains 1.0 scale for 1 and 2 players, and scales down smoothly for 3 and 4 players', () => {
    const layout1 = calculateMultiTrackLayout(1, V_HEIGHT, V_WIDTH);
    const layout2 = calculateMultiTrackLayout(2, V_HEIGHT, V_WIDTH);
    const layout3 = calculateMultiTrackLayout(3, V_HEIGHT, V_WIDTH);
    const layout4 = calculateMultiTrackLayout(4, V_HEIGHT, V_WIDTH);

    expect(layout1.scale).toBe(1.0);
    expect(layout2.scale).toBe(1.0);
    expect(layout3.scale).toBeLessThan(1.0);
    expect(layout4.scale).toBeLessThan(layout3.scale);
    expect(layout4.scale).toBeGreaterThanOrEqual(0.55);
  });
});
