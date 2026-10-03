import { SpriteManager, SKINS, SkinAnimationSet, CHROMIUM_SPRITES } from './sprites';
import { GameEngine } from '../core/game-engine';
import { Obstacle } from '../core/obstacles';
import {
  calculateDinoNameBadgePos,
  sanitizeTextNoEmojis,
  resolveDinoRenderFrame,
  getPterodactylWingFrame,
} from './ui-helpers';

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

export type MatchOverlayState =
  | { type: 'COUNTDOWN'; text: string }
  | { type: 'LOCAL_CRASHED_SPECTATING'; myDistance: number }
  | { type: 'VICTORY'; myDistance: number; rivalDistance: number; rivalName: string }
  | { type: 'DEFEAT'; myDistance: number; rivalDistance: number; rivalName: string }
  | { type: 'TIE'; distance: number }
  | { type: 'SOLO_GAME_OVER'; distance: number; highScore: number };

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
    overlay: MatchOverlayState | null = null,
    isRivalEliminated: boolean = false,
    isSolo: boolean = false
  ): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // 1. Classic Chrome Dino Dark Mode Background: #202124
    ctx.fillStyle = '#202124';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // 2. Draw Track 1 (Top Track - Player 1 / Local Player)
    const isCountdown = overlay?.type === 'COUNTDOWN';
    this.drawTrack(
      this.track1GroundY,
      localEngine.distance,
      localPlayer,
      localEngine.obstacles,
      'TU PISTA (P1)',
      localPlayer.color || '#ffffff',
      true,
      isCountdown
    );

    // Celebratory alert when rival died and local is still running
    if (isRivalEliminated && !localPlayer.isDead) {
      const now = performance.now();
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      ctx.fillStyle = pulse > 0.5 ? '#f1c40f' : '#ffffff';
      ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('¡RIVAL ELIMINADO! CORRE POR EL RÉCORD', this.vWidth / 2, this.track1GroundY - 145);
    }

    // 3. Middle Divider (Subtle minimalist line)
    this.drawDivider();

    // 4. Draw Track 2 (Bottom Track - Player 2 / Rival or Solo)
    if (remotePlayer && !isSolo) {
      const isBot = remotePlayer.name.includes('BOT');
      this.drawTrack(
        this.track2GroundY,
        remotePlayer.distance,
        remotePlayer,
        localEngine.obstacles, // Exact same obstacles because identical seed
        isBot ? 'BOT' : 'PISTA RIVAL (P2)',
        remotePlayer.color || '#acacac',
        false,
        isCountdown
      );
    } else {
      this.drawWaitingTrack(this.track2GroundY, isSolo);
    }

    // 5. Overlays: Asymmetric Game Over / Spectating / Victory / Solo
    if (overlay) {
      switch (overlay.type) {
        case 'COUNTDOWN':
          this.drawCountdownOverlay(overlay.text);
          break;
        case 'LOCAL_CRASHED_SPECTATING':
          this.drawSpectatingOverlay(overlay.myDistance);
          break;
        case 'VICTORY':
          this.drawVictoryOverlay(overlay.myDistance, overlay.rivalDistance, overlay.rivalName);
          break;
        case 'DEFEAT':
          this.drawDefeatOverlay(overlay.myDistance, overlay.rivalDistance, overlay.rivalName);
          break;
        case 'TIE':
          this.drawTieOverlay(overlay.distance);
          break;
        case 'SOLO_GAME_OVER':
          this.drawSoloGameOverOverlay(overlay.distance, overlay.highScore);
          break;
      }
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
      ctx.fillText(`${label}: ${player.name.substring(0, 13)}`, 28, groundY - 181);
    } else {
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = accentColor;
      ctx.fillText(`${label}: ${player.name.substring(0, 13)}`, 28, groundY - 181);
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

  private drawDino(player: PlayerVisualState, x: number, groundY: number): void {
    const ctx = this.ctx;
    const skin: SkinAnimationSet = SKINS[player.skinId] || SKINS.classic;
    const img = this.spriteManager.getImage('/dino-skins.png') || this.spriteManager.getImage('/dino-classic.png');

    const resolved = resolveDinoRenderFrame(
      skin,
      player.isDead,
      player.isDucking,
      player.isGrounded,
      player.distance
    );
    const spriteRect = resolved.spriteRect;
    const renderWidth = resolved.renderWidth;
    const renderHeight = resolved.renderHeight;
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

    // Floating Nickname Badge strictly above the dinosaur (guaranteed 14px clearance)
    this.drawDinoNickBadge(player, x, renderWidth || 44, renderHeight, groundY);
  }

  private drawDinoNickBadge(
    player: PlayerVisualState,
    x: number,
    dinoWidth: number,
    dinoHeight: number,
    groundY: number
  ): void {
    const ctx = this.ctx;
    // Guaranteed 14px clearance so the nickname NEVER touches or obscures the dino sprite
    const badgePos = calculateDinoNameBadgePos({
      groundY,
      dinoHeight,
      jumpY: player.y,
      dinoScreenX: x,
      dinoWidth,
      clearance: 14,
    });

    const cleanName = sanitizeTextNoEmojis(player.name.substring(0, 12)).toUpperCase();
    const displayName = cleanName || (player.isLocal ? 'TU DINO' : 'RIVAL');

    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // High-contrast dark outline ensuring 100% legibility over clouds and background
    ctx.strokeStyle = '#101112';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'miter';
    ctx.strokeText(displayName, badgePos.x, badgePos.y);

    // Player's chosen customized color
    ctx.fillStyle = player.color || '#ffffff';
    ctx.fillText(displayName, badgePos.x, badgePos.y);
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
        // Pterodactyl wings flap at authentic cadence (alternating every 180ms)
        const wingFrame = getPterodactylWingFrame(Date.now());
        const s = CHROMIUM_SPRITES.PTERODACTYL[wingFrame] || CHROMIUM_SPRITES.PTERODACTYL[0];
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, s.w, s.h);
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
      const wingFrame = getPterodactylWingFrame(Date.now());
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

  private drawWaitingTrack(groundY: number, isSolo: boolean = false): void {
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
    if (isSolo) {
      ctx.fillText('MODO EN SOLITARIO', this.vWidth / 2, groundY - 90);
    } else {
      ctx.fillText('ESPERANDO AL RIVAL EN LA SALA...', this.vWidth / 2, groundY - 90);
    }
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
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillText('PISTA 1: TU DINO (ARRIBA)', this.vWidth / 2, this.vHeight / 2 + 25);

    ctx.fillStyle = '#acacac';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PISTA 2: RIVAL (ABAJO)', this.vWidth / 2, this.vHeight / 2 + 52);

    ctx.fillStyle = '#70757a';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('[ESPACIO / ARRIBA]: SALTAR   |   [ABAJO]: AGACHARSE', this.vWidth / 2, this.vHeight / 2 + 82);
  }

  private drawSpectatingOverlay(myDistance: number): void {
    const ctx = this.ctx;
    // Darken ONLY Track 1 (top half) leaving Track 2 completely clear to spectate!
    ctx.fillStyle = 'rgba(32, 33, 36, 0.78)';
    ctx.fillRect(0, 0, this.vWidth, 255);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G A M E   O V E R', this.vWidth / 2, 65);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`CHOCASTE A LOS ${myDistance} METROS`, this.vWidth / 2, 105);

    ctx.fillStyle = '#f1c40f';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('MODO ESPECTADOR: EL RIVAL SIGUE CORRIENDO ABAJO', this.vWidth / 2, 145);

    ctx.fillStyle = '#70757a';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('EL RESULTADO FINAL SE MOSTRARÁ CUANDO EL RIVAL CHOQUE', this.vWidth / 2, 175);
  }

  private drawVictoryOverlay(myDistance: number, rivalDistance: number, rivalName: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(32, 33, 36, 0.88)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // Glowing Retro Gold VICTORY Title
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡ V I C T O R I A !', this.vWidth / 2, this.vHeight / 2 - 75);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText('¡HAS GANADO EL DUELO!', this.vWidth / 2, this.vHeight / 2 - 25);

    // Score comparison card
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(this.vWidth / 2 - 260, this.vHeight / 2 + 5, 520, 56);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.vWidth / 2 - 260, this.vHeight / 2 + 5, 520, 56);

    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`TÚ: ${myDistance} m   vs   ${rivalName}: ${rivalDistance} m`, this.vWidth / 2, this.vHeight / 2 + 25);

    const diff = myDistance - rivalDistance;
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(`+${diff} METROS DE VENTAJA`, this.vWidth / 2, this.vHeight / 2 + 45);

    // Rematch call to action
    ctx.fillStyle = '#acacac';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('PULSA REVANCHA PARA CORRER DE NUEVO', this.vWidth / 2, this.vHeight / 2 + 95);
  }

  private drawDefeatOverlay(myDistance: number, rivalDistance: number, rivalName: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(32, 33, 36, 0.88)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    // Classic Red/Gray Game Over
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G A M E   O V E R', this.vWidth / 2, this.vHeight / 2 - 75);

    ctx.fillStyle = '#acacac';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`DERROTA: ${rivalName} LLEGÓ MÁS LEJOS`, this.vWidth / 2, this.vHeight / 2 - 25);

    // Comparison card
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(this.vWidth / 2 - 260, this.vHeight / 2 + 5, 520, 56);
    ctx.strokeStyle = '#535353';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.vWidth / 2 - 260, this.vHeight / 2 + 5, 520, 56);

    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillStyle = '#acacac';
    ctx.fillText(`TÚ: ${myDistance} m   vs   ${rivalName}: ${rivalDistance} m`, this.vWidth / 2, this.vHeight / 2 + 25);

    const diff = rivalDistance - myDistance;
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(`-${diff} METROS DE DIFERENCIA`, this.vWidth / 2, this.vHeight / 2 + 45);

    ctx.fillStyle = '#70757a';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('PULSA REVANCHA PARA VOLVER A INTENTARLO', this.vWidth / 2, this.vHeight / 2 + 95);
  }

  private drawTieOverlay(distance: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(32, 33, 36, 0.88)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡ E M P A T E !', this.vWidth / 2, this.vHeight / 2 - 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`AMBOS CHOCARON A LOS ${distance} METROS`, this.vWidth / 2, this.vHeight / 2 + 10);

    ctx.fillStyle = '#70757a';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('PULSA REVANCHA PARA EL DESEMPATE', this.vWidth / 2, this.vHeight / 2 + 60);
  }

  private drawSoloGameOverOverlay(distance: number, highScore: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(32, 33, 36, 0.88)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G A M E   O V E R', this.vWidth / 2, this.vHeight / 2 - 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`DISTANCIA: ${distance} METROS`, this.vWidth / 2, this.vHeight / 2 - 20);

    if (highScore > 0) {
      ctx.fillStyle = distance >= highScore ? '#f1c40f' : '#acacac';
      ctx.font = '11px "Press Start 2P", monospace';
      const recordLabel = distance >= highScore ? '¡NUEVO RECORD PERSONAL!' : `RECORD: ${highScore} METROS`;
      ctx.fillText(recordLabel, this.vWidth / 2, this.vHeight / 2 + 15);
    }

    ctx.fillStyle = '#70757a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PULSA [ESPACIO / ENTER] O [JUGAR DE NUEVO]', this.vWidth / 2, this.vHeight / 2 + 65);
  }
}
