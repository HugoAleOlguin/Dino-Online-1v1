import { Box } from './collision';

export enum DinoAction {
  JUMP = 'JUMP',
  JUMP_END = 'JUMP_END',
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
  public gravityMultiplier: number = 1.0;

  constructor(config: DinoConfig = {}) {
    this.x = config.xPosition ?? 60;
    // Exactly calibrated to Chromium offline.js jump curve:
    // At 60 FPS: 12 px/frame jump, 0.58 px/frame^2 gravity
    this.jumpVelocity = config.jumpVelocity ?? 720;
    this.gravity = config.gravity ?? -2100;
    this.fastFallMultiplier = 2.8;
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

      case DinoAction.JUMP_END:
        // Variable jump height: release early for short hop
        if (!this.isGrounded && this.vy > 240 && this.y > 25) {
          this.vy = 240;
        }
        break;

      case DinoAction.DUCK_START:
        this.isDucking = true;
        // Fast drop if ducking while in mid-air (official SPEED_DROP_COEFFICIENT)
        if (!this.isGrounded) {
          this.vy = Math.min(this.vy, -400);
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
      const effGravity = this.gravity * this.gravityMultiplier;
      const currentGravity = this.isDucking
        ? effGravity * this.fastFallMultiplier
        : effGravity;

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
    this.gravityMultiplier = 1.0;
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
