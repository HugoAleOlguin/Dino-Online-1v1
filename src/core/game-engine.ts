import { Dino, DinoAction } from './physics';
import { Obstacle, generateObstaclesForTrack } from './obstacles';
import { EventManager, MatchEvent } from './events';
import {
  TREX_COLLISION_BOXES,
  OBSTACLE_COLLISION_BOXES,
  checkMultiBoxCollision,
} from './collision-boxes';

export interface GameEngineConfig {
  initialSpeed?: number;
  maxSpeed?: number;
  acceleration?: number;
}

export class GameEngine {
  public seed: number;
  public readonly dino: Dino;
  public obstacles: Obstacle[] = [];
  public eventManager: EventManager;
  public activeEvent: MatchEvent | null = null;

  public distance: number = 0;
  public speed: number;
  public isGameOver: boolean = false;

  private readonly initialSpeed: number;
  private readonly maxSpeed: number;
  private trackGeneratedUpTo: number = 3000;

  public onCollision?: (finalScore: number, distance: number) => void;

  constructor(seed: number, config: GameEngineConfig = {}) {
    this.seed = seed;
    this.initialSpeed = config.initialSpeed ?? 360;
    this.maxSpeed = config.maxSpeed ?? 820;
    this.speed = this.initialSpeed;

    this.dino = new Dino({ xPosition: 60 });
    this.obstacles = generateObstaclesForTrack(seed, this.trackGeneratedUpTo);
    this.eventManager = new EventManager(seed);
  }

  get score(): number {
    return Math.floor(this.distance / 10);
  }

  handleInput(action: DinoAction): void {
    if (this.isGameOver) return;
    this.dino.handleInput(action);
  }

  update(dt: number): void {
    if (this.isGameOver) return;

    // 1. Check for active events at current distance
    this.activeEvent = this.eventManager.getActiveEvent(this.distance);
    if (this.activeEvent) {
      this.dino.gravityMultiplier = this.activeEvent.gravityMultiplier;
    } else {
      this.dino.gravityMultiplier = 1.0;
    }

    // 2. Update local dino physics (0ms input latency)
    this.dino.update(dt);

    // 3. Advance track distance
    const speedBonus = this.activeEvent ? this.activeEvent.speedBonus : 0;
    this.distance += (this.speed + speedBonus) * dt;

    // 4. Gradual acceleration curve matching Chrome
    this.speed = Math.min(
      this.maxSpeed,
      this.initialSpeed + Math.pow(this.distance / 1000, 0.72) * 48
    );

    // 5. Extend obstacles buffer if needed
    if (this.distance + 2500 > this.trackGeneratedUpTo) {
      this.trackGeneratedUpTo += 2500;
      this.obstacles = generateObstaclesForTrack(this.seed, this.trackGeneratedUpTo);
    }

    // 6. Pixel-accurate Multi-Box Collision check (Chromium offline.js exact model)
    const dinoScreenX = this.dino.x;
    const dinoHeight = this.dino.isDucking ? 30 : 47;
    const dinoScreenY = -dinoHeight - this.dino.y;
    const dinoBoxes = this.dino.isDucking
      ? TREX_COLLISION_BOXES.DUCKING
      : TREX_COLLISION_BOXES.RUNNING;

    for (const obstacle of this.obstacles) {
      const obsScreenX = obstacle.x - this.distance + dinoScreenX;

      // Phase 1: Fast bounding box discard
      if (obsScreenX > dinoScreenX + 60) break; // obstacles are sorted by X
      if (obsScreenX + obstacle.width < dinoScreenX - 5) continue; // passed

      // Phase 2: Multi-box precision check
      const obsScreenY = -obstacle.height - obstacle.y;
      let obstacleBoxes = OBSTACLE_COLLISION_BOXES.CACTUS_SMALL;

      if (obstacle.type === 'CACTUS_LARGE') {
        obstacleBoxes = OBSTACLE_COLLISION_BOXES.CACTUS_LARGE;
      } else if (obstacle.type === 'CACTUS_DOUBLE') {
        obstacleBoxes = OBSTACLE_COLLISION_BOXES.CACTUS_DOUBLE;
      } else if (obstacle.type.startsWith('PTERODACTYL')) {
        obstacleBoxes = OBSTACLE_COLLISION_BOXES.PTERODACTYL;
      }

      if (
        checkMultiBoxCollision(
          dinoBoxes,
          dinoScreenX,
          dinoScreenY,
          obstacleBoxes,
          obsScreenX,
          obsScreenY
        )
      ) {
        this.isGameOver = true;
        this.dino.die();
        if (this.onCollision) {
          this.onCollision(this.score, Math.floor(this.distance));
        }
        break;
      }
    }
  }

  reset(newSeed: number = this.seed): void {
    this.seed = newSeed;
    this.distance = 0;
    this.speed = this.initialSpeed;
    this.isGameOver = false;
    this.dino.reset();
    this.trackGeneratedUpTo = 3000;
    this.obstacles = generateObstaclesForTrack(newSeed, this.trackGeneratedUpTo);
    this.eventManager = new EventManager(newSeed);
    this.activeEvent = null;
  }
}
