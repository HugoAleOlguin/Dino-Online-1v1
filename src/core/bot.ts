import { GameEngine } from './game-engine';
import { DinoAction } from './physics';

export class DinoBot {
  public engine: GameEngine;
  private isDucking = false;
  private obstaclesCleared = 0;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  update(dt: number): void {
    if (this.engine.isGameOver) return;

    this.engine.update(dt);

    const dinoWorldX = this.engine.distance + this.engine.dino.x;

    // Find next obstacle
    let nextObs = null;
    for (const obs of this.engine.obstacles) {
      if (obs.x + obs.width > dinoWorldX - 10) {
        nextObs = obs;
        break;
      }
    }

    if (!nextObs) return;

    const distanceToObs = nextObs.x - dinoWorldX;

    // Trigger distance scales with speed (so bot jumps at the right instant)
    const triggerDistance = Math.min(180, Math.max(90, this.engine.speed * 0.22));

    if (distanceToObs > 0 && distanceToObs <= triggerDistance) {
      if (nextObs.type === 'PTERODACTYL_HIGH') {
        if (!this.isDucking) {
          this.engine.handleInput(DinoAction.DUCK_START);
          this.isDucking = true;
        }
      } else {
        if (this.engine.dino.isGrounded) {
          this.obstaclesCleared++;
          // Bot has human-like reaction: 4% chance of misjudging a jump after clearing 7 obstacles
          const misjudge = this.obstaclesCleared > 7 && Math.random() < 0.04;
          if (!misjudge) {
            this.engine.handleInput(DinoAction.JUMP);
          }
        }
      }
    } else if (this.isDucking && distanceToObs <= -20) {
      this.engine.handleInput(DinoAction.DUCK_END);
      this.isDucking = false;
    }
  }

  reset(seed: number): void {
    this.engine.reset(seed);
    this.isDucking = false;
    this.obstaclesCleared = 0;
  }
}
