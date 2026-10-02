import { PRNG } from './prng';
import { Box } from './collision';

export type ObstacleType =
  | 'CACTUS_SMALL'
  | 'CACTUS_DOUBLE'
  | 'CACTUS_LARGE'
  | 'PTERODACTYL_LOW'
  | 'PTERODACTYL_HIGH';

export interface Obstacle extends Box {
  id: number;
  type: ObstacleType;
}

export function getObstacleDimensions(type: ObstacleType): { width: number; height: number; y: number } {
  switch (type) {
    case 'CACTUS_SMALL':
      return { width: 17, height: 35, y: 0 };
    case 'CACTUS_DOUBLE':
      return { width: 34, height: 35, y: 0 };
    case 'CACTUS_LARGE':
      return { width: 25, height: 50, y: 0 };
    case 'PTERODACTYL_LOW':
      // Low pterodactyl: player MUST jump over it
      return { width: 44, height: 32, y: 15 };
    case 'PTERODACTYL_HIGH':
      // High pterodactyl: player can run or duck under it, jumping will hit it
      return { width: 44, height: 32, y: 55 };
  }
}

/**
 * Deterministically generates an array of obstacles up to a given track distance.
 * Uses the shared seed so all players receive the exact same sequence.
 */
export function generateObstaclesForTrack(seed: number, distance: number): Obstacle[] {
  const rng = new PRNG(seed);
  const obstacles: Obstacle[] = [];

  let currentX = 500; // Initial safe runway before first obstacle
  let id = 1;

  const obstacleTypes: ObstacleType[] = [
    'CACTUS_SMALL',
    'CACTUS_DOUBLE',
    'CACTUS_LARGE',
    'PTERODACTYL_LOW',
    'PTERODACTYL_HIGH',
  ];

  while (currentX < distance) {
    // Select obstacle type based on distance (pterodactyls appear after distance 800)
    let type: ObstacleType;
    if (currentX < 800) {
      const typeIndex = rng.nextInt(0, 2);
      type = obstacleTypes[typeIndex];
    } else {
      const typeIndex = rng.nextInt(0, 4);
      type = obstacleTypes[typeIndex];
    }

    const dims = getObstacleDimensions(type);

    obstacles.push({
      id: id++,
      type,
      x: currentX,
      y: dims.y,
      width: dims.width,
      height: dims.height,
    });

    // Distance to next obstacle: gap between 320 and 580 px
    const gap = rng.nextInt(320, 580);
    currentX += gap;
  }

  return obstacles;
}
