import { SpriteManager, SKINS, SkinAnimationSet } from './sprites';
import { GameEngine } from '../core/game-engine';
import { Obstacle } from '../core/obstacles';

export interface PlayerVisualState {
  name: string;
  color: string;
  skinId: string;
  isLocal: boolean;
  score: number;
  distance: number;
  y: number;
  isDucking: boolean;
  isGrounded: boolean;
  isDead: boolean;
}

export class DoubleTrackRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spriteManager: SpriteManager;

  // Virtual resolution
  public readonly vWidth = 960;
  public readonly vHeight = 540;

  // Track layout coordinates (Chrome dark mode palette)
  public readonly track1GroundY = 220; // Top track ground
  public readonly track2GroundY = 470; // Bottom track ground

  constructor(canvas: HTMLCanvasElement, spriteManager: SpriteManager) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;
    this.spriteManager = spriteManager;
  }

  render(
    localEngine: GameEngine,
    localPlayer: PlayerVisualState,
    remotePlayer: PlayerVisualState | null,
    countdownText: string | null = null,
    winnerMessage: string | null = null
  ): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // Classic Chrome Dino Dark Mode Background: #202124
    ctx.fillStyle = '#202124';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // 1. Draw Track 1 (Top Track - Player 1 / Local)
    this.drawTrack(
      this.track1GroundY,
      localEngine.distance,
      localPlayer,
      localEngine.obstacles,
      'P1 (TÚ)',
      localPlayer.color || '#ffffff'
    );

    // 2. Middle Divider (Subtle minimalist dashed line #3c4043)
    ctx.strokeStyle = '#3c4043';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(20, 255);
    ctx.lineTo(this.vWidth - 20, 255);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Track 2 (Bottom Track - Player 2 / Rival or Bot)
    if (remotePlayer) {
      this.drawTrack(
        this.track2GroundY,
        remotePlayer.distance,
        remotePlayer,
        localEngine.obstacles, // Same obstacles because same seed
        remotePlayer.name.includes('BOT') ? 'BOT' : 'P2 (RIVAL)',
        remotePlayer.color || '#acacac'
      );
    } else {
      this.drawWaitingTrack(this.track2GroundY);
    }

    // 4. Overlays: Countdown or Winner announcement
    if (countdownText) {
      this.drawCountdownOverlay(countdownText);
    } else if (winnerMessage) {
      this.drawWinnerOverlay(winnerMessage);
    }
  }

  private drawTrack(
    groundY: number,
    distance: number,
    player: PlayerVisualState,
    obstacles: Obstacle[],
    label: string,
    accentColor: string
  ): void {
    const ctx = this.ctx;

    // Track Header: Classic Chrome Dino Minimalist typography
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Player tag badge
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.fillStyle = accentColor;
    ctx.fillText(`${label}: ${player.name.substring(0, 14)}`, 24, groundY - 180);

    // Classic 5-digit Distance Counter on the right (like Google Dino: HI 00000  00450)
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px "Press Start 2P", monospace';
    ctx.fillStyle = '#acacac';
    const scoreStr = Math.floor(distance / 10).toString().padStart(5, '0');
    ctx.fillText(`${scoreStr} m`, this.vWidth - 30, groundY - 180);

    // Classic Ground Line: #535353
    ctx.strokeStyle = '#535353';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(this.vWidth - 20, groundY);
    ctx.stroke();

    // Classic scrolling ground pebbles and bumps
    ctx.fillStyle = '#535353';
    const scrollOffset = Math.floor(distance) % 48;
    for (let x = 20 - scrollOffset; x < this.vWidth - 20; x += 48) {
      if (x >= 20) {
        ctx.fillRect(x, groundY + 3, 16, 2);
        ctx.fillRect(x + 24, groundY + 7, 8, 2);
        ctx.fillRect(x + 36, groundY + 4, 3, 2);
      }
    }

    // Obstacles: Drawn in authentic Chrome Dino Dark Gray/White (#acacac)
    const dinoScreenX = 60;
    for (const obs of obstacles) {
      const screenX = obs.x - distance + dinoScreenX;
      if (screenX < -60 || screenX > this.vWidth + 40) continue;
      this.drawObstacle(obs, screenX, groundY);
    }

    // Dino
    this.drawDino(player, dinoScreenX, groundY);

    // If player crashed
    if (player.isDead) {
      ctx.fillStyle = 'rgba(32, 33, 36, 0.65)';
      ctx.fillRect(20, groundY - 190, this.vWidth - 40, 195);

      ctx.fillStyle = '#acacac';
      ctx.font = 'bold 16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASH', dinoScreenX + 30, groundY - 70);
    }
  }

  private drawDino(player: PlayerVisualState, x: number, groundY: number): void {
    const ctx = this.ctx;
    const skin: SkinAnimationSet = SKINS[player.skinId] || SKINS.classic;
    const img = this.spriteManager.getImage('/dino-skins.png') || this.spriteManager.getImage('/dino-classic.png');

    // Natural running cadence: legs alternate every 24 pixels of track distance
    const runStep = Math.floor(player.distance / 24) % 2;

    let spriteRect = skin.idle;
    if (player.isDead) {
      spriteRect = skin.dead;
    } else if (!player.isGrounded) {
      spriteRect = skin.idle; // in air
    } else if (player.isDucking) {
      spriteRect = skin.duck[runStep] || skin.duck[0];
    } else {
      spriteRect = skin.run[runStep] || skin.run[0];
    }

    const renderHeight = player.isDucking ? skin.duckHeight : skin.targetHeight;
    const renderWidth = Math.round((spriteRect.w / spriteRect.h) * renderHeight);
    const screenY = groundY - renderHeight - player.y;

    if (img) {
      ctx.drawImage(
        img,
        spriteRect.x,
        spriteRect.y,
        spriteRect.w,
        spriteRect.h,
        x,
        screenY,
        renderWidth,
        renderHeight
      );
    } else {
      ctx.fillStyle = '#acacac';
      ctx.fillRect(x, screenY, renderWidth || 44, renderHeight || 47);
    }
  }

  private drawObstacle(obs: Obstacle, screenX: number, groundY: number): void {
    const ctx = this.ctx;
    const screenY = groundY - obs.height - obs.y;

    // Classic Chrome Dino color: #acacac (exact monochrome grey)
    ctx.fillStyle = '#acacac';

    if (obs.type === 'CACTUS_SMALL') {
      // Small cactus: 3 parts matching hitboxes
      ctx.fillRect(screenX, screenY + 7, 5, 27);
      ctx.fillRect(screenX + 4, screenY, 7, 35);
      ctx.fillRect(screenX + 11, screenY + 4, 6, 14);
    } else if (obs.type === 'CACTUS_DOUBLE') {
      // Cactus 1
      ctx.fillRect(screenX, screenY + 7, 5, 27);
      ctx.fillRect(screenX + 4, screenY, 6, 35);
      ctx.fillRect(screenX + 10, screenY + 4, 6, 14);
      // Cactus 2
      ctx.fillRect(screenX + 17, screenY + 7, 5, 27);
      ctx.fillRect(screenX + 21, screenY, 6, 35);
      ctx.fillRect(screenX + 27, screenY + 4, 6, 14);
    } else if (obs.type === 'CACTUS_LARGE') {
      // Large Cactus: 3 parts matching hitboxes
      ctx.fillRect(screenX, screenY + 12, 7, 38);
      ctx.fillRect(screenX + 8, screenY, 8, 50);
      ctx.fillRect(screenX + 15, screenY + 10, 10, 38);
    } else {
      // Pterodactyl: wings flap at calm rhythm (every 40px of distance)
      const wingFrame = Math.floor(obs.x / 40) % 2;
      // Head and beak
      ctx.fillRect(screenX + 2, screenY + 14, 4, 3);
      ctx.fillRect(screenX + 6, screenY + 10, 4, 7);
      ctx.fillRect(screenX + 10, screenY + 8, 6, 9);
      // Body
      ctx.fillRect(screenX + 15, screenY + 15, 16, 5);
      // Rear wing
      ctx.fillRect(screenX + 18, screenY + 21, 24, 6);
      // Wing motion
      if (wingFrame === 0) {
        ctx.fillRect(screenX + 14, screenY + 4, 8, 12);
      } else {
        ctx.fillRect(screenX + 14, screenY + 18, 8, 12);
      }
    }
  }

  private drawWaitingTrack(groundY: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#3c4043';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(this.vWidth - 20, groundY);
    ctx.stroke();

    ctx.fillStyle = '#70757a';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ESPERANDO AL RIVAL EN LA SALA...', this.vWidth / 2, groundY - 90);
  }

  private drawCountdownOverlay(text: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(32, 33, 36, 0.75)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.vWidth / 2, this.vHeight / 2);
  }

  private drawWinnerOverlay(message: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(32, 33, 36, 0.85)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // Classic G A M E   O V E R style
    ctx.fillStyle = '#535353';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G A M E   O V E R', this.vWidth / 2, this.vHeight / 2 - 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText(message, this.vWidth / 2, this.vHeight / 2 + 15);

    ctx.fillStyle = '#70757a';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('PULSA REVANCHA PARA CORRER DE NUEVO', this.vWidth / 2, this.vHeight / 2 + 65);
  }
}
