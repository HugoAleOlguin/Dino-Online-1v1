import { SpriteManager, SKINS, SkinAnimationSet, CHROMIUM_SPRITES } from './sprites';
import { GameEngine } from '../core/game-engine';
import { Obstacle } from '../core/obstacles';
import { MatchEvent } from '../core/events';

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
    winnerMessage: string | null = null,
    activeEvent: MatchEvent | null = null
  ): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // 1. Classic Chrome Dino Dark Mode Background: #202124
    ctx.fillStyle = '#202124';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // 2. Active Event Atmospheric Visual Effects (underneath tracks)
    if (activeEvent) {
      this.drawEventAtmosphere(activeEvent, localEngine.distance);
    }

    // 3. Draw Track 1 (Top Track - Player 1 / Local Player)
    this.drawTrack(
      this.track1GroundY,
      localEngine.distance,
      localPlayer,
      localEngine.obstacles,
      'TU PISTA (P1)',
      localPlayer.color || '#ffffff',
      true,
      countdownText !== null
    );

    // 4. Middle Divider with Active Event Banner or Minimalist Line
    if (activeEvent) {
      this.drawEventBanner(activeEvent, localEngine.distance);
    } else {
      this.drawDivider();
    }

    // 5. Draw Track 2 (Bottom Track - Player 2 / Rival or Bot)
    if (remotePlayer) {
      const isBot = remotePlayer.name.includes('BOT');
      this.drawTrack(
        this.track2GroundY,
        remotePlayer.distance,
        remotePlayer,
        localEngine.obstacles, // Exact same obstacles because identical seed
        isBot ? 'BOT' : 'PISTA RIVAL (P2)',
        remotePlayer.color || '#acacac',
        false,
        countdownText !== null
      );
    } else {
      this.drawWaitingTrack(this.track2GroundY);
    }

    // 6. Overlays: Countdown or Winner announcement
    if (countdownText) {
      this.drawCountdownOverlay(countdownText);
    } else if (winnerMessage) {
      this.drawWinnerOverlay(winnerMessage);
    }
  }

  private drawDivider(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#3c4043';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(20, 255);
    ctx.lineTo(this.vWidth - 20, 255);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawEventBanner(event: MatchEvent, currentDistance: number): void {
    const ctx = this.ctx;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 150);

    const bannerW = 560;
    const bannerH = 28;
    const bannerX = (this.vWidth - bannerW) / 2;
    const bannerY = 255 - bannerH / 2;

    // Glowing border and background
    ctx.fillStyle = '#1e2023';
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);

    ctx.strokeStyle = pulse > 0.5 ? '#f1c40f' : '#e67e22';
    ctx.lineWidth = 2;
    ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);

    // Event title & description
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(event.badge, this.vWidth / 2, bannerY + 11);

    // Remaining distance progress bar
    const totalDist = Math.max(1, event.endDistance - event.startDistance);
    const elapsedDist = Math.max(0, Math.min(totalDist, currentDistance - event.startDistance));
    const remainingRatio = 1 - (elapsedDist / totalDist);

    ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
    ctx.fillRect(bannerX + 2, bannerY + bannerH - 4, bannerW - 4, 3);

    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(bannerX + 2, bannerY + bannerH - 4, (bannerW - 4) * remainingRatio, 3);
  }

  private drawEventAtmosphere(event: MatchEvent, distance: number): void {
    const ctx = this.ctx;
    const now = performance.now();
    const spriteImg = this.spriteManager.getImage('/offline-sprite-dark.png');

    switch (event.type) {
      case 'ECLIPSE': {
        // Deep cosmic darkness tint
        ctx.fillStyle = 'rgba(10, 8, 18, 0.45)';
        ctx.fillRect(0, 0, this.vWidth, this.vHeight);

        // Blood-red moon in the sky
        if (spriteImg) {
          ctx.drawImage(spriteImg, CHROMIUM_SPRITES.MOON.x, CHROMIUM_SPRITES.MOON.y, 40, 40, 780, 20, 36, 36);
          ctx.drawImage(spriteImg, CHROMIUM_SPRITES.MOON.x, CHROMIUM_SPRITES.MOON.y, 40, 40, 780, 275, 36, 36);
        }
        // Twinkling stars
        ctx.fillStyle = '#ffffff';
        const stars = [
          { x: 120, y: 40 }, { x: 340, y: 65 }, { x: 580, y: 30 }, { x: 710, y: 80 },
          { x: 220, y: 295 }, { x: 450, y: 320 }, { x: 670, y: 285 }
        ];
        stars.forEach((s, idx) => {
          const starAlpha = 0.3 + 0.7 * Math.abs(Math.sin((now / 300) + idx));
          ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
          ctx.fillRect(s.x, s.y, 2, 2);
        });
        break;
      }

      case 'METEOR_SHOWER': {
        // Diagonal blazing shooting meteors
        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const mProgress = ((now / 2 + i * 200) % 1000) / 1000;
          const mx = (i * 180 + mProgress * 400) % (this.vWidth + 200) - 100;
          const my = mProgress * 220;
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx - 35, my - 25);
          ctx.stroke();

          // Second track meteors
          ctx.beginPath();
          ctx.moveTo(mx + 40, my + 250);
          ctx.lineTo(mx + 5, my + 225);
          ctx.stroke();
        }
        break;
      }

      case 'SANDSTORM': {
        // Fast horizontal howling wind and dust
        ctx.fillStyle = 'rgba(230, 180, 100, 0.18)';
        ctx.fillRect(0, 0, this.vWidth, this.vHeight);
        ctx.fillStyle = 'rgba(240, 200, 120, 0.4)';
        for (let i = 0; i < 20; i++) {
          const sx = (this.vWidth - ((now * 0.8 + i * 85) % (this.vWidth + 50)));
          const sy = (i * 28) % this.vHeight;
          ctx.fillRect(sx, sy, 22, 2);
        }
        break;
      }

      case 'LOW_GRAVITY': {
        // Floating cosmic motes rising upwards
        ctx.fillStyle = 'rgba(100, 200, 255, 0.5)';
        for (let i = 0; i < 14; i++) {
          const fx = (i * 72 + Math.sin(now / 500 + i) * 20) % this.vWidth;
          const fy = (this.vHeight - ((now * 0.05 + i * 40) % this.vHeight));
          ctx.fillRect(fx, fy, 3, 3);
        }
        break;
      }

      case 'TURBO_SPRINT': {
        // Hypersonic speed lines trailing horizontally
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let i = 0; i < 12; i++) {
          const lx = ((now * 1.5 + i * 95) % (this.vWidth + 100)) - 80;
          const ly = 50 + (i * 38) % (this.vHeight - 100);
          ctx.fillRect(lx, ly, 45, 2);
        }
        break;
      }
    }
  }

  private drawTrack(
    groundY: number,
    distance: number,
    player: PlayerVisualState,
    obstacles: Obstacle[],
    label: string,
    accentColor: string,
    isLocal: boolean,
    isCountdown: boolean
  ): void {
    const ctx = this.ctx;
    const spriteImg = this.spriteManager.getImage('/offline-sprite-dark.png');
    const dinoScreenX = 60;

    // Track Header: Classic Chrome Dino Minimalist typography
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Highlight Box for Local Player Track
    if (isLocal) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(18, groundY - 188, 380, 26);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(18, groundY - 188, 380, 26);

      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = accentColor;
      ctx.fillText(`▶ ${label}: ${player.name.substring(0, 13)}`, 28, groundY - 181);
    } else {
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = accentColor;
      ctx.fillText(`  ${label}: ${player.name.substring(0, 13)}`, 28, groundY - 181);
    }

    // Classic 5-digit Distance Counter on the right (like Google Dino: HI 00000  00450)
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.fillStyle = '#acacac';
    const scoreStr = Math.floor(distance / 10).toString().padStart(5, '0');
    ctx.fillText(`${scoreStr} m`, this.vWidth - 30, groundY - 181);

    // Drifting authentic clouds in the sky
    if (spriteImg) {
      const cloudSpeed = 0.12;
      const c1X = Math.round((850 - distance * cloudSpeed) % (this.vWidth + 100)) - 50;
      const c2X = Math.round((420 - distance * cloudSpeed * 0.8) % (this.vWidth + 100)) - 50;
      const c1Adjusted = c1X < -50 ? c1X + this.vWidth + 100 : c1X;
      const c2Adjusted = c2X < -50 ? c2X + this.vWidth + 100 : c2X;

      ctx.drawImage(spriteImg, CHROMIUM_SPRITES.CLOUD.x, CHROMIUM_SPRITES.CLOUD.y, 46, 14, c1Adjusted, groundY - 145, 46, 14);
      ctx.drawImage(spriteImg, CHROMIUM_SPRITES.CLOUD.x, CHROMIUM_SPRITES.CLOUD.y, 46, 14, c2Adjusted, groundY - 105, 46, 14);
    }

    // Authentic Chrome Dino Ground Horizon line: repeating 600px pattern
    if (spriteImg) {
      const horizonW = 600;
      const scrollOffset = Math.floor(distance) % horizonW;
      for (let hx = 20 - scrollOffset; hx < this.vWidth; hx += horizonW) {
        ctx.drawImage(spriteImg, CHROMIUM_SPRITES.HORIZON.x, CHROMIUM_SPRITES.HORIZON.y, 600, 12, hx, groundY - 4, 600, 12);
      }
    } else {
      ctx.strokeStyle = '#535353';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, groundY);
      ctx.lineTo(this.vWidth - 20, groundY);
      ctx.stroke();
    }

    // Obstacles: Drawn with authentic Chromium dark sprites
    for (const obs of obstacles) {
      const screenX = obs.x - distance + dinoScreenX;
      if (screenX < -60 || screenX > this.vWidth + 40) continue;
      this.drawObstacle(obs, screenX, groundY);
    }

    // Dino
    this.drawDino(player, dinoScreenX, groundY);

    // Pre-game clear visual indicator ("¿Quién soy yo antes de empezar?")
    if (isCountdown) {
      this.drawPreGameIndicator(isLocal, dinoScreenX, groundY, accentColor);
    }

    // If player crashed
    if (player.isDead) {
      ctx.fillStyle = 'rgba(32, 33, 36, 0.65)';
      ctx.fillRect(20, groundY - 190, this.vWidth - 40, 195);

      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 15px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASH', dinoScreenX + 30, groundY - 70);
    }
  }

  private drawPreGameIndicator(
    isLocal: boolean,
    dinoScreenX: number,
    groundY: number,
    accentColor: string
  ): void {
    const ctx = this.ctx;
    const now = performance.now();
    const bounce = Math.round(Math.sin(now / 140) * 5);
    const tagY = groundY - 70 + bounce;

    if (isLocal) {
      // Prominent bouncing marker directly over local dino
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▼ TÚ (P1) ▼', dinoScreenX + 22, tagY);

      // Downward pointer arrow
      ctx.beginPath();
      ctx.moveTo(dinoScreenX + 16, tagY + 6);
      ctx.lineTo(dinoScreenX + 28, tagY + 6);
      ctx.lineTo(dinoScreenX + 22, tagY + 14);
      ctx.fill();
    } else {
      // Muted marker over rival dino
      ctx.fillStyle = '#70757a';
      ctx.font = 'bold 9px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RIVAL', dinoScreenX + 22, tagY + 4);
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
    const img = this.spriteManager.getImage('/offline-sprite-dark.png');

    if (img) {
      if (obs.type === 'CACTUS_SMALL') {
        const s = CHROMIUM_SPRITES.CACTUS_SMALL;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, s.w, s.h);
        return;
      } else if (obs.type === 'CACTUS_DOUBLE') {
        const s = CHROMIUM_SPRITES.CACTUS_DOUBLE;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, s.w, s.h);
        return;
      } else if (obs.type === 'CACTUS_LARGE') {
        const s = CHROMIUM_SPRITES.CACTUS_LARGE;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, s.w, s.h);
        return;
      } else {
        // Pterodactyl wings flap at calm rhythm (every 40px of distance)
        const wingFrame = Math.floor(obs.x / 40) % 2;
        const s = CHROMIUM_SPRITES.PTERODACTYL[wingFrame] || CHROMIUM_SPRITES.PTERODACTYL[0];
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, 46, 40);
        return;
      }
    }

    // Monochrome Fallback if image not ready yet
    ctx.fillStyle = '#acacac';
    if (obs.type === 'CACTUS_SMALL') {
      ctx.fillRect(screenX, screenY + 7, 5, 27);
      ctx.fillRect(screenX + 4, screenY, 7, 35);
      ctx.fillRect(screenX + 11, screenY + 4, 6, 14);
    } else if (obs.type === 'CACTUS_DOUBLE') {
      ctx.fillRect(screenX, screenY + 7, 5, 27);
      ctx.fillRect(screenX + 4, screenY, 6, 35);
      ctx.fillRect(screenX + 10, screenY + 4, 6, 14);
      ctx.fillRect(screenX + 17, screenY + 7, 5, 27);
      ctx.fillRect(screenX + 21, screenY, 6, 35);
      ctx.fillRect(screenX + 27, screenY + 4, 6, 14);
    } else if (obs.type === 'CACTUS_LARGE') {
      ctx.fillRect(screenX, screenY + 12, 7, 38);
      ctx.fillRect(screenX + 8, screenY, 8, 50);
      ctx.fillRect(screenX + 15, screenY + 10, 10, 38);
    } else {
      const wingFrame = Math.floor(obs.x / 40) % 2;
      ctx.fillRect(screenX + 2, screenY + 14, 4, 3);
      ctx.fillRect(screenX + 6, screenY + 10, 4, 7);
      ctx.fillRect(screenX + 10, screenY + 8, 6, 9);
      ctx.fillRect(screenX + 15, screenY + 15, 16, 5);
      ctx.fillRect(screenX + 18, screenY + 21, 24, 6);
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
    // Translucent dark veil so dinos and tracks remain visible
    ctx.fillStyle = 'rgba(32, 33, 36, 0.60)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // Large Countdown Number
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.vWidth / 2, this.vHeight / 2 - 40);

    // Prominent clarity guide
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.fillText('⬆ TÚ ERES EL DINO DE ARRIBA (PISTA 1)', this.vWidth / 2, this.vHeight / 2 + 25);

    ctx.fillStyle = '#acacac';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('⬇ EL RIVAL CORRE ABAJO (PISTA 2)', this.vWidth / 2, this.vHeight / 2 + 52);

    ctx.fillStyle = '#70757a';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('[ESPACIO / ARRIBA]: SALTAR   |   [FLECHA ABAJO]: AGACHARSE', this.vWidth / 2, this.vHeight / 2 + 82);
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
