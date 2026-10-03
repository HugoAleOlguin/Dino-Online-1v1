import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/core/game-engine';
import { DinoAction } from '../src/core/physics';

describe('Solo Mode Game Flow', () => {
  it('runs independently with a local seed and advances distance', () => {
    const engine = new GameEngine(99999);
    expect(engine.isGameOver).toBe(false);
    expect(engine.distance).toBe(0);

    // Run for 60 ticks (~1 second) before first obstacle
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }

    expect(engine.distance).toBeGreaterThan(100);
    expect(engine.isGameOver).toBe(false);
  });

  it('handles player jump and duck actions in solo run', () => {
    const engine = new GameEngine(12345);

    // Jump
    engine.handleInput(DinoAction.JUMP);
    engine.update(1 / 60);
    expect(engine.dino.isGrounded).toBe(false);
    expect(engine.dino.vy).toBeGreaterThan(0);
    expect(engine.dino.y).toBeGreaterThan(0);

    // Reset for another solo run
    engine.reset(54321);
    expect(engine.dino.isGrounded).toBe(true);
    expect(engine.distance).toBe(0);
    expect(engine.isGameOver).toBe(false);
  });

  it('triggers immediate game over upon obstacle collision without remote dependency', () => {
    const engine = new GameEngine(12345);
    let collisionDetected = false;
    let finalDistance = 0;

    engine.onCollision = (_score, distance) => {
      collisionDetected = true;
      finalDistance = Math.floor(distance);
    };

    // Run until obstacle collision occurs
    for (let i = 0; i < 600; i++) {
      if (engine.isGameOver) break;
      engine.update(1 / 60);
    }

    expect(collisionDetected).toBe(true);
    expect(engine.isGameOver).toBe(true);
    expect(finalDistance).toBeGreaterThan(0);
  });
});
