import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/core/game-engine';
import { DinoAction } from '../src/core/physics';

describe('GameEngine Integration', () => {
  it('initializes game engine with seed and starts at 0 distance', () => {
    const engine = new GameEngine(12345);
    expect(engine.distance).toBe(0);
    expect(engine.score).toBe(0);
    expect(engine.isGameOver).toBe(false);
  });

  it('progresses distance and score over time', () => {
    const engine = new GameEngine(12345);
    for (let i = 0; i < 60; i++) {
      engine.update(1 / 60);
    }
    expect(engine.distance).toBeGreaterThan(300);
    expect(engine.score).toBeGreaterThan(20);
  });

  it('detects collision when obstacle is hit', () => {
    const engine = new GameEngine(12345);
    // Find first obstacle position
    const firstObstacle = engine.obstacles[0];
    const timeToReach = (firstObstacle.x - engine.dino.x) / engine.speed;

    // Simulate without jumping until obstacle is hit
    const ticks = Math.ceil(timeToReach * 60) + 10;
    for (let i = 0; i < ticks; i++) {
      engine.update(1 / 60);
      if (engine.isGameOver) break;
    }

    expect(engine.isGameOver).toBe(true);
    expect(engine.dino.isDead).toBe(true);
  });

  it('avoids collision when jumping in time', () => {
    const engine = new GameEngine(12345);
    const firstObstacle = engine.obstacles[0];
    const timeToReach = (firstObstacle.x - engine.dino.x) / engine.speed;

    // Jump just before reaching the obstacle (~0.25s before)
    const jumpTick = Math.floor((timeToReach - 0.25) * 60);
    for (let i = 0; i < jumpTick + 30; i++) {
      if (i === jumpTick) {
        engine.handleInput(DinoAction.JUMP);
      }
      engine.update(1 / 60);
    }

    expect(engine.dino.isDead).toBe(false);
    expect(engine.isGameOver).toBe(false);
  });
});
