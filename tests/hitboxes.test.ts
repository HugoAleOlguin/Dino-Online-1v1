import { describe, it, expect } from 'vitest';
import {
  CollisionBox,
  TREX_COLLISION_BOXES,
  OBSTACLE_COLLISION_BOXES,
  checkMultiBoxCollision,
} from '../src/core/collision-boxes';

describe('Official Chrome Dino Multi-Box Collision Detection', () => {
  it('has exact Chromium running hitboxes (6 boxes for head, torso, legs)', () => {
    expect(TREX_COLLISION_BOXES.RUNNING.length).toBe(6);
    expect(TREX_COLLISION_BOXES.RUNNING[0]).toEqual(new CollisionBox(22, 0, 17, 16));
  });

  it('has exact Chromium ducking hitbox (1 low box)', () => {
    expect(TREX_COLLISION_BOXES.DUCKING.length).toBe(1);
    expect(TREX_COLLISION_BOXES.DUCKING[0]).toEqual(new CollisionBox(1, 18, 55, 25));
  });

  it('avoids collision when jumping high enough over small cactus', () => {
    const dinoBoxes = TREX_COLLISION_BOXES.RUNNING;
    const dinoScreenX = 60;
    // Dino is 55px high in the air
    const dinoGroundY = 200;
    const dinoHeight = 47;
    const dinoAltitude = 55; // High jump
    const dinoScreenY = dinoGroundY - dinoHeight - dinoAltitude;

    const cactusBoxes = OBSTACLE_COLLISION_BOXES.CACTUS_SMALL;
    const cactusScreenX = 60;
    const cactusHeight = 35;
    const cactusScreenY = dinoGroundY - cactusHeight;

    const hit = checkMultiBoxCollision(
      dinoBoxes,
      dinoScreenX,
      dinoScreenY,
      cactusBoxes,
      cactusScreenX,
      cactusScreenY
    );

    expect(hit).toBe(false);
  });

  it('collides when dino hits the cactus trunk', () => {
    const dinoBoxes = TREX_COLLISION_BOXES.RUNNING;
    const dinoScreenX = 60;
    const dinoGroundY = 200;
    const dinoHeight = 47;
    const dinoAltitude = 0; // On ground!
    const dinoScreenY = dinoGroundY - dinoHeight - dinoAltitude;

    const cactusBoxes = OBSTACLE_COLLISION_BOXES.CACTUS_SMALL;
    const cactusScreenX = 70; // Overlapping
    const cactusHeight = 35;
    const cactusScreenY = dinoGroundY - cactusHeight;

    const hit = checkMultiBoxCollision(
      dinoBoxes,
      dinoScreenX,
      dinoScreenY,
      cactusBoxes,
      cactusScreenX,
      cactusScreenY
    );

    expect(hit).toBe(true);
  });

  it('allows ducking under high pterodactyl without collision', () => {
    const duckingBoxes = TREX_COLLISION_BOXES.DUCKING;
    const dinoScreenX = 60;
    const dinoGroundY = 200;
    const duckHeight = 30;
    const dinoScreenY = dinoGroundY - duckHeight; // On ground ducking

    // High pterodactyl at altitude 55 above ground
    const pteroBoxes = OBSTACLE_COLLISION_BOXES.PTERODACTYL;
    const pteroScreenX = 70;
    const pteroHeight = 30;
    const pteroAltitude = 45;
    const pteroScreenY = dinoGroundY - pteroHeight - pteroAltitude;

    const hit = checkMultiBoxCollision(
      duckingBoxes,
      dinoScreenX,
      dinoScreenY,
      pteroBoxes,
      pteroScreenX,
      pteroScreenY
    );

    expect(hit).toBe(false);
  });
});
