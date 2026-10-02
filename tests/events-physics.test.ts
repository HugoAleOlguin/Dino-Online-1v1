import { describe, it, expect } from 'vitest';
import { EventManager } from '../src/core/events';
import { Dino, DinoAction } from '../src/core/physics';
import { GameEngine } from '../src/core/game-engine';

describe('EventManager (Deterministic In-Game Random Events)', () => {
  it('generates deterministic schedule of 5 events based on seed', () => {
    const seed = 54321;
    const em1 = new EventManager(seed);
    const em2 = new EventManager(seed);

    expect(em1.events.length).toBe(5);
    expect(em1.events).toEqual(em2.events);
  });

  it('correctly activates and deactivates events based on distance', () => {
    const em = new EventManager(12345);
    const firstEvent = em.events[0];

    // Before first event
    expect(em.getActiveEvent(firstEvent.startDistance - 10)).toBeNull();

    // In the middle of first event
    const midDist = (firstEvent.startDistance + firstEvent.endDistance) / 2;
    const active = em.getActiveEvent(midDist);
    expect(active).not.toBeNull();
    expect(active?.type).toBe(firstEvent.type);

    // After first event (before second event)
    expect(em.getActiveEvent(firstEvent.endDistance + 50)).toBeNull();
  });

  it('influences dino gravity when LOW_GRAVITY event is active', () => {
    const engine = new GameEngine(12345);
    // Find if or when LOW_GRAVITY is scheduled
    const lowGravEvent = engine.eventManager.events.find((e) => e.type === 'LOW_GRAVITY');
    if (lowGravEvent) {
      engine.distance = (lowGravEvent.startDistance + lowGravEvent.endDistance) / 2;
      engine.update(1 / 60);
      expect(engine.dino.gravityMultiplier).toBe(0.70);
    }
  });
});

describe('Variable Jump Height & Fast Drop Feel', () => {
  it('short hops when JUMP_END is released early', () => {
    const fullJumpDino = new Dino();
    const shortHopDino = new Dino();

    // Start jump on both
    fullJumpDino.handleInput(DinoAction.JUMP);
    shortHopDino.handleInput(DinoAction.JUMP);

    // Let them rise for 4 frames (~66ms)
    for (let i = 0; i < 4; i++) {
      fullJumpDino.update(1 / 60);
      shortHopDino.update(1 / 60);
    }

    // Release jump key on shortHopDino
    shortHopDino.handleInput(DinoAction.JUMP_END);

    // Continue simulation and record maximum peak heights
    let fullJumpPeak = 0;
    let shortHopPeak = 0;

    for (let i = 0; i < 45; i++) {
      fullJumpDino.update(1 / 60);
      shortHopDino.update(1 / 60);

      if (fullJumpDino.y > fullJumpPeak) fullJumpPeak = fullJumpDino.y;
      if (shortHopDino.y > shortHopPeak) shortHopPeak = shortHopDino.y;
    }

    // Full jump must reach significantly higher altitude than short hop
    expect(shortHopPeak).toBeLessThan(fullJumpPeak);
    expect(shortHopPeak).toBeGreaterThan(30); // Still clears small obstacles
  });

  it('fast falls immediately when ducking in mid-air', () => {
    const regularDino = new Dino();
    const fastFallDino = new Dino();

    regularDino.handleInput(DinoAction.JUMP);
    fastFallDino.handleInput(DinoAction.JUMP);

    // Rise for 8 frames
    for (let i = 0; i < 8; i++) {
      regularDino.update(1 / 60);
      fastFallDino.update(1 / 60);
    }

    // Duck in mid-air
    fastFallDino.handleInput(DinoAction.DUCK_START);
    expect(fastFallDino.vy).toBeLessThanOrEqual(-400);

    // Update for 6 frames
    for (let i = 0; i < 6; i++) {
      regularDino.update(1 / 60);
      fastFallDino.update(1 / 60);
    }

    // Fast fall dino lands or drops much faster
    expect(fastFallDino.y).toBeLessThan(regularDino.y);
  });
});
