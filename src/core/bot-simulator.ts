import { Dino, DinoAction } from './physics';
import { Obstacle } from './obstacles';
import {
  TREX_COLLISION_BOXES,
  OBSTACLE_COLLISION_BOXES,
  checkMultiBoxCollision,
} from './collision-boxes';

export interface BotProfile {
  name: string;
  color: string;
  skinId: string;
}

const BOT_NAMES = ['Bot Rex', 'Bot Raptor', 'Bot Stego', 'Bot Ptero', 'Bot Cyber', 'Bot Pixel'];
const BOT_COLORS = ['#3498db', '#e67e22', '#9b59b6', '#1abc9c', '#e74c3c', '#f1c40f'];
const BOT_SKINS = ['classic', 'neon', 'cyber', 'retro'];

export function createRandomBotProfile(index: number = 1): BotProfile {
  const name = BOT_NAMES[(index - 1) % BOT_NAMES.length] || `Bot ${index}`;
  const color = BOT_COLORS[(index - 1) % BOT_COLORS.length] || '#3498db';
  const skinId = BOT_SKINS[(index - 1) % BOT_SKINS.length] || 'classic';
  return { name, color, skinId };
}

export class BotSimulator {
  public readonly peerId: string;
  public profile: BotProfile;
  public dino: Dino;
  public distance: number = 0;
  public score: number = 0;
  public isSpectating: boolean;
  public failureDistance: number;

  private duckTimer: number = 0;

  constructor(peerId: string, profile: BotProfile, isSpectating: boolean = false) {
    this.peerId = peerId;
    this.profile = profile;
    this.dino = new Dino();
    this.isSpectating = isSpectating;
    if (isSpectating) {
      this.dino.isDead = true;
    }
    // Random target distance between 350m and 1200m where the bot will eventually mistime a jump
    this.failureDistance = 350 + Math.floor(Math.random() * 850);
  }

  get state() {
    return {
      y: this.dino.y,
      vy: this.dino.vy,
      isDucking: this.dino.isDucking,
      isGrounded: this.dino.isGrounded,
      distance: Math.floor(this.distance),
      score: this.score,
      isDead: this.dino.isDead,
    };
  }

  jump(): void {
    if (!this.dino.isDead && this.dino.isGrounded) {
      this.dino.handleInput(DinoAction.JUMP);
    }
  }

  duck(): void {
    if (!this.dino.isDead) {
      this.dino.handleInput(DinoAction.DUCK_START);
      this.duckTimer = 0.45; // Duck for approx 450ms
    }
  }

  resetForNewMatch(): void {
    this.isSpectating = false;
    this.dino = new Dino();
    this.distance = 0;
    this.score = 0;
    this.duckTimer = 0;
    this.failureDistance = 350 + Math.floor(Math.random() * 850);
  }

  evaluateObstacles(obstacles: Obstacle[], speed: number): void {
    if (this.dino.isDead || this.isSpectating) return;

    // Simulate intentional failure once the bot exceeds its planned failure distance
    const willFail = this.distance >= this.failureDistance;

    const dinoX = this.dino.x; // default 60
    // Dynamic trigger distance calibrated to game speed
    const triggerDistance = Math.max(90, 75 + speed * 0.16);

    for (const obs of obstacles) {
      // In world coordinates where obstacles spawn ahead of dino
      const distToObstacle = obs.x - this.distance;

      if (distToObstacle > 0 && distToObstacle <= triggerDistance) {
        if (willFail && distToObstacle < 45) {
          // Intentionally do nothing to hit obstacle
          return;
        }

        if (obs.type === 'PTERODACTYL_HIGH') {
          this.duck();
        } else {
          this.jump();
        }
        break;
      }
    }
  }

  update(dt: number, speed: number, obstacles: Obstacle[]): boolean {
    if (this.dino.isDead || this.isSpectating) {
      return false;
    }

    this.distance += (speed * dt) * 0.025;
    this.score = Math.floor(this.distance);

    // AI reactive decision
    this.evaluateObstacles(obstacles, speed);

    // Duck timer update
    if (this.dino.isDucking) {
      this.duckTimer -= dt;
      if (this.duckTimer <= 0) {
        this.dino.handleInput(DinoAction.DUCK_END);
      }
    }

    // Physics step
    this.dino.update(dt);

    // Multi-Box Collision check matching Chromium Dino
    const dinoScreenX = this.dino.x;
    const dinoHeight = this.dino.isDucking ? 30 : 47;
    const dinoScreenY = -dinoHeight - this.dino.y;
    const dinoBoxes = this.dino.isDucking
      ? TREX_COLLISION_BOXES.DUCKING
      : TREX_COLLISION_BOXES.RUNNING;

    for (const obs of obstacles) {
      const obsScreenX = obs.x - this.distance + dinoScreenX;
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
        this.dino.isDead = true;
        return true; // just died
      }
    }

    return false;
  }
}
