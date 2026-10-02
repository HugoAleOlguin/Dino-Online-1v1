import { Box } from './collision';

export enum DinoAction {
  JUMP = 'JUMP',
  DUCK_START = 'DUCK_START',
  DUCK_END = 'DUCK_END',
}

export interface DinoConfig {
  jumpVelocity?: number;
  gravity?: number;
  fastFallVelocity?: number;
  xPosition?: number;
}

export class Dino {
  // Position Y: altitude above track ground (0 = on ground)
  public y: number = 0;
  public vy: number = 0;
  public isGrounded: boolean = true;
  public isDucking: boolean = false;
  public isDead: boolean = false;

  public readonly x: number;
  private readonly jumpVelocity: number;
  private readonly gravity: number;
  private readonly fastFallMultiplier: number;

  constructor(config: DinoConfig = {}) {
    this.x = config.xPosition ?? 60;
    this.jumpVelocity = config.jumpVelocity ?? 600;
    this.gravity = config.gravity ?? -1800;
    this.fastFallMultiplier = 2.2;
  }

  handleInput(action: DinoAction): void {
    if (this.isDead) return;

    switch (action) {
      case DinoAction.JUMP:
        if (this.isGrounded) {
          this.vy = this.jumpVelocity;
          this.isGrounded = false;
          this.isDucking = false;
        }
        break;

      case DinoAction.DUCK_START:
        this.isDucking = true;
        // Fast fall if ducking while in mid-air
        if (!this.isGrounded && this.vy > -300) {
          this.vy = -500;
        }
        break;

      case DinoAction.DUCK_END:
        this.isDucking = false;
        break;
    }
  }

  update(dt: number): void {
    if (this.isDead) return;

    if (!this.isGrounded) {
      const currentGravity = this.isDucking
        ? this.gravity * this.fastFallMultiplier
        : this.gravity;

      this.y += this.vy * dt;
      this.vy += currentGravity * dt;

      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isGrounded = true;
      }
    }
  }

  die(): void {
    this.isDead = true;
  }

  reset(): void {
    this.y = 0;
    this.vy = 0;
    this.isGrounded = true;
    this.isDucking = false;
    this.isDead = false;
  }

  getHitbox(): Box {
    if (this.isDucking) {
      return {
        x: this.x,
        y: this.y,
        width: 59,
        height: 30,
      };
    }
    return {
      x: this.x,
      y: this.y,
      width: 44,
      height: 47,
    };
  }
}
