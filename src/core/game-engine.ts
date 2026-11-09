import { Dino, DinoAction } from './physics';
import { Obstacle, generateObstaclesForTrack } from './obstacles';
import {
  TREX_COLLISION_BOXES,
  OBSTACLE_COLLISION_BOXES,
  checkMultiBoxCollision,
} from './collision-boxes';
import { findVisibleObstacleRange, ObstacleRange } from '../render/ui-helpers';

export interface GameEngineConfig {
  initialSpeed?: number;
  maxSpeed?: number;
  acceleration?: number;
}

export class GameEngine {
  public seed: number;
  public readonly dino: Dino;
  public obstacles: Obstacle[] = [];

  public distance: number = 0;
  public prevDistance: number = 0;
  public prevY: number = 0;
  public speed: number;
  public isGameOver: boolean = false;

  private readonly initialSpeed: number;
  private readonly maxSpeed: number;
  private trackGeneratedUpTo: number = 3000;
  private collisionRange: ObstacleRange = { startIndex: 0, endIndex: 0 };

  public onCollision?: (finalScore: number, distance: number) => void;

  constructor(seed: number, config: GameEngineConfig = {}) {
    this.seed = seed;
    this.initialSpeed = config.initialSpeed ?? 360;
    this.maxSpeed = config.maxSpeed ?? 820;
    this.speed = this.initialSpeed;

    this.dino = new Dino({ xPosition: 60 });
    this.obstacles = generateObstaclesForTrack(seed, this.trackGeneratedUpTo);
  }

  get score(): number {
    return Math.floor(this.distance / 10);
  }

  getInterpolatedDistance(alpha: number): number {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    return this.prevDistance + (this.distance - this.prevDistance) * clampedAlpha;
  }

  getInterpolatedY(alpha: number): number {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    return this.prevY + (this.dino.y - this.prevY) * clampedAlpha;
  }

  handleInput(action: DinoAction): void {
    if (this.isGameOver) return;
    this.dino.handleInput(action);
  }

  update(dt: number): void {
    if (this.isGameOver) return;

    // Snapshot previous state for temporal interpolation between 60Hz ticks
    this.prevDistance = this.distance;
    this.prevY = this.dino.y;

    // 1. Update local dino physics (0ms input latency)
    this.dino.update(dt);

    // 2. Advance track distance
    this.distance += this.speed * dt;

    // 3. Gradual acceleration curve matching Chrome
    this.speed = Math.min(
      this.maxSpeed,
      this.initialSpeed + Math.pow(this.distance / 1000, 0.72) * 48
    );

    // 4. Extend obstacles buffer if needed
    if (this.distance + 2500 > this.trackGeneratedUpTo) {
      this.trackGeneratedUpTo += 2500;
      this.obstacles = generateObstaclesForTrack(this.seed, this.trackGeneratedUpTo);
    }

    // 5. Pixel-accurate Multi-Box Collision check with O(log N) binary search culling
    const dinoScreenX = this.dino.x;
    const dinoHeight = this.dino.isDucking ? 30 : 47;
    const dinoScreenY = -dinoHeight - this.dino.y;
    const dinoBoxes = this.dino.isDucking
      ? TREX_COLLISION_BOXES.DUCKING
      : TREX_COLLISION_BOXES.RUNNING;

    const minTrackX = this.distance - dinoScreenX - 60;
    const maxTrackX = this.distance - dinoScreenX + 160;
    findVisibleObstacleRange(this.obstacles, minTrackX, maxTrackX, this.collisionRange);

    for (let i = this.collisionRange.startIndex; i < this.collisionRange.endIndex; i++) {
      const obs = this.obstacles[i];
      const obsScreenX = obs.x - this.distance + dinoScreenX;
      // Broad-phase early exit
      if (obsScreenX < -60 || obsScreenX > 160) continue;

      const obsScreenY = -obs.height - obs.y;
      const obsBoxes = (OBSTACLE_COLLISION_BOXES as any)[obs.type] || [
        { x: 0, y: 0, width: obs.width, height: obs.height },
      ];

      const collided = checkMultiBoxCollision(
        dinoBoxes,
        dinoScreenX,
        dinoScreenY,
        obsBoxes,
        obsScreenX,
        obsScreenY
      );

      if (collided) {
        this.isGameOver = true;
        this.dino.die();
        if (this.onCollision) {
          this.onCollision(this.score, this.distance);
        }
        break;
      }
    }
  }

  reset(newSeed: number = this.seed): void {
    this.seed = newSeed;
    this.distance = 0;
    this.prevDistance = 0;
    this.prevY = 0;
    this.speed = this.initialSpeed;
    this.isGameOver = false;
    this.dino.reset();
    this.trackGeneratedUpTo = 3000;
    this.obstacles = generateObstaclesForTrack(newSeed, this.trackGeneratedUpTo);
  }
}
