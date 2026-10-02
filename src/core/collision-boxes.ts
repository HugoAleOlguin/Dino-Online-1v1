/**
 * Exact, pixel-accurate collision boxes based on the official Chromium Chrome Dino game (offline.js).
 * Replaces crude single-rectangle hitboxes with multi-box anatomical silhouettes.
 */

export class CollisionBox {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number
  ) {}
}

export const TREX_COLLISION_BOXES = {
  RUNNING: [
    new CollisionBox(22, 0, 17, 16), // Head
    new CollisionBox(1, 18, 30, 9),  // Upper torso
    new CollisionBox(10, 35, 14, 8), // Feet / Legs
    new CollisionBox(1, 24, 29, 5),  // Mid body
    new CollisionBox(5, 30, 21, 4),  // Lower belly
    new CollisionBox(9, 34, 15, 4),  // Thighs
  ],
  DUCKING: [
    new CollisionBox(1, 18, 55, 25), // Low horizontal crouching silhouette
  ],
};

export const OBSTACLE_COLLISION_BOXES = {
  CACTUS_SMALL: [
    new CollisionBox(0, 7, 5, 27),   // Left arm
    new CollisionBox(4, 0, 6, 34),   // Central trunk
    new CollisionBox(10, 4, 7, 14),  // Right arm
  ],
  CACTUS_DOUBLE: [
    new CollisionBox(0, 7, 5, 27),
    new CollisionBox(4, 0, 6, 34),
    new CollisionBox(10, 4, 7, 14),
    new CollisionBox(17, 7, 5, 27),
    new CollisionBox(21, 0, 6, 34),
    new CollisionBox(27, 4, 7, 14),
  ],
  CACTUS_LARGE: [
    new CollisionBox(0, 12, 7, 38),  // Left arm
    new CollisionBox(8, 0, 7, 49),   // Tall center stalk
    new CollisionBox(13, 10, 10, 38),// Right arm
  ],
  PTERODACTYL: [
    new CollisionBox(15, 15, 16, 5), // Main body core
    new CollisionBox(18, 21, 24, 6), // Tail & rear wing
    new CollisionBox(2, 14, 4, 3),   // Beak tip
    new CollisionBox(6, 10, 4, 7),   // Head
    new CollisionBox(10, 8, 6, 9),   // Front wing
  ],
};

export function boxCompare(
  a: CollisionBox,
  ax: number,
  ay: number,
  b: CollisionBox,
  bx: number,
  by: number
): boolean {
  const aLeft = ax + a.x;
  const aRight = aLeft + a.width;
  const aTop = ay + a.y;
  const aBottom = aTop + a.height;

  const bLeft = bx + b.x;
  const bRight = bLeft + b.width;
  const bTop = by + b.y;
  const bBottom = bTop + b.height;

  return !(
    aRight <= bLeft ||
    aLeft >= bRight ||
    aBottom <= bTop ||
    aTop >= bBottom
  );
}

export function checkMultiBoxCollision(
  boxesA: readonly CollisionBox[],
  ax: number,
  ay: number,
  boxesB: readonly CollisionBox[],
  bx: number,
  by: number
): boolean {
  for (let i = 0; i < boxesA.length; i++) {
    for (let j = 0; j < boxesB.length; j++) {
      if (boxCompare(boxesA[i], ax, ay, boxesB[j], bx, by)) {
        return true;
      }
    }
  }
  return false;
}
