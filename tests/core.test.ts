import { describe, it, expect } from 'vitest';
import { PRNG } from '../src/core/prng';
import { Dino, DinoAction } from '../src/core/physics';
import { generateObstaclesForTrack } from '../src/core/obstacles';
import { checkAABBCollision } from '../src/core/collision';

describe('Deterministic PRNG', () => {
  it('produces identical sequences given the same seed', () => {
    const seed = 123456789;
    const rng1 = new PRNG(seed);
    const rng2 = new PRNG(seed);

    const seq1 = Array.from({ length: 20 }, () => rng1.next());
    const seq2 = Array.from({ length: 20 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
    expect(seq1[0]).toBeGreaterThanOrEqual(0);
    expect(seq1[0]).toBeLessThan(1);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = new PRNG(42);
    const rng2 = new PRNG(999);
    expect(rng1.next()).not.toEqual(rng2.next());
  });
});

describe('Dino Physics State Machine', () => {
  it('starts on ground in running state', () => {
    const dino = new Dino();
    expect(dino.y).toBe(0);
    expect(dino.vy).toBe(0);
    expect(dino.isGrounded).toBe(true);
    expect(dino.isDucking).toBe(false);
    expect(dino.isDead).toBe(false);
  });

  it('handles jump physics and returns to ground', () => {
    const dino = new Dino();
    dino.handleInput(DinoAction.JUMP);
    expect(dino.isGrounded).toBe(false);
    expect(dino.vy).toBeGreaterThan(0);

    // Simulate jump until dino completes the arc
    let maxAltitude = 0;
    for (let i = 0; i < 50; i++) {
      dino.update(1 / 60);
      if (dino.y > maxAltitude) maxAltitude = dino.y;
    }
    expect(maxAltitude).toBeGreaterThan(50);
    expect(dino.isGrounded).toBe(true);
    expect(dino.y).toBe(0);
  });

  it('changes hitbox when ducking', () => {
    const dino = new Dino();
    const standingHitbox = dino.getHitbox();
    dino.handleInput(DinoAction.DUCK_START);
    const duckingHitbox = dino.getHitbox();

    expect(duckingHitbox.height).toBeLessThan(standingHitbox.height);
    dino.handleInput(DinoAction.DUCK_END);
    expect(dino.getHitbox().height).toEqual(standingHitbox.height);
  });
});

describe('Deterministic Obstacle Generation', () => {
  it('generates identical obstacle positions and types for both players using shared seed', () => {
    const seed = 987654321;
    const obstaclesPlayer1 = generateObstaclesForTrack(seed, 2000);
    const obstaclesPlayer2 = generateObstaclesForTrack(seed, 2000);

    expect(obstaclesPlayer1.length).toBeGreaterThan(3);
    expect(obstaclesPlayer1).toEqual(obstaclesPlayer2);
  });
});

describe('AABB Collision Detection', () => {
  it('detects collision when bounding boxes overlap', () => {
    const box1 = { x: 100, y: 0, width: 44, height: 47 };
    const box2 = { x: 120, y: 0, width: 30, height: 50 };
    expect(checkAABBCollision(box1, box2)).toBe(true);
  });

  it('does not detect collision when jumping high above the obstacle', () => {
    const boxDinoJumping = { x: 100, y: 70, width: 44, height: 47 };
    const boxCactus = { x: 100, y: 0, width: 25, height: 50 };
    expect(checkAABBCollision(boxDinoJumping, boxCactus)).toBe(false);
  });
});
