import { SpriteManager, SKINS, SkinAnimationSet, CHROMIUM_SPRITES } from './sprites';
import { GameEngine } from '../core/game-engine';
import { Obstacle } from '../core/obstacles';
import {
  calculateDinoNameBadgePos,
  sanitizeTextNoEmojis,
  resolveDinoRenderFrame,
  getPterodactylWingFrame,
  calculateMultiTrackLayout,
  MultiTrackLayout,
  findVisibleObstacleRange,
  ObstacleRange,
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

export interface TrackRenderData {
  distance: number;
  player: PlayerVisualState;
  obstacles: Obstacle[];
  label: string;
  accentColor: string;
  isLocal: boolean;
  isSpectating?: boolean;
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

  // High-performance zero-allocation layout cache & obstacle window structs
  private layoutCache: Map<number, MultiTrackLayout> = new Map();
  private renderObstacleRange: ObstacleRange = { startIndex: 0, endIndex: 0 };

  constructor(canvas: HTMLCanvasElement, spriteManager: SpriteManager) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;
    this.spriteManager = spriteManager;
  }

  public getCachedLayout(numTracks: number): MultiTrackLayout {
    const count = Math.max(1, Math.min(4, numTracks));
    let layout = this.layoutCache.get(count);
    if (!layout) {
      layout = calculateMultiTrackLayout(count, this.vHeight, this.vWidth);
      this.layoutCache.set(count, layout);
    }
    return layout;
  }

  render(
    localEngine: GameEngine,
    localPlayer: PlayerVisualState,
    remotePlayer: PlayerVisualState | null,
    overlay: MatchOverlayState | null = null,
    isRivalEliminated: boolean = false,
    isSolo: boolean = false
  ): void {
    const tracks: TrackRenderData[] = [
      {
        distance: localEngine.distance,
        player: localPlayer,
        obstacles: localEngine.obstacles,
        label: 'TU PISTA (P1)',
        accentColor: localPlayer.color || '#ffffff',
        isLocal: true,
      },
    ];

    if (remotePlayer && !isSolo) {
      tracks.push({
        distance: remotePlayer.distance,
        player: remotePlayer,
        obstacles: localEngine.obstacles,
        label: 'PISTA RIVAL (P2)',
        accentColor: remotePlayer.color || '#acacac',
        isLocal: false,
      });
    }

    this.renderTracks(tracks, overlay, isRivalEliminated, isSolo);
  }

  renderTracks(
    tracks: TrackRenderData[],
    overlay: MatchOverlayState | null = null,
    isRivalEliminated: boolean = false,
    isSolo: boolean = false
  ): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // 1. Classic Chrome Dino Dark Mode Background
    ctx.fillStyle = '#202124';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    const isCountdown = overlay?.type === 'COUNTDOWN';
    const numTracks = Math.max(1, tracks.length);
    const layout = this.getCachedLayout(numTracks);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const groundY = layout.groundYs[i];
      const topY = layout.topBoundaries[i];

      if (i > 0) {
        this.drawDividerAt(topY);
      }

      this.drawTrack(
        groundY,
        track.distance,
        track.player,
        track.obstacles,
        track.label,
        track.accentColor,
        track.isLocal,
        isCountdown,
        layout.scale,
        topY,
        layout.trackHeight
      );
    }

    if (tracks.length === 1 && !isSolo) {
      this.drawWaitingTrack(this.track2GroundY, isSolo);
    }

    // Celebratory alert if rival eliminated and local running in 2-player mode
    if (isRivalEliminated && tracks[0] && !tracks[0].player.isDead && tracks.length === 2) {
      const now = performance.now();
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      ctx.fillStyle = pulse > 0.5 ? '#f1c40f' : '#ffffff';
      ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('¡RIVAL ELIMINADO! CORRE POR EL RÉCORD', this.vWidth / 2, layout.groundYs[0] - 145);
    }

    // 5. Overlays
    if (overlay) {
      switch (overlay.type) {
        case 'COUNTDOWN':
          this.drawCountdownOverlay(overlay.text);
          break;
        case 'LOCAL_CRASHED_SPECTATING':
          this.drawSpectatingOverlay(overlay.myDistance, layout, tracks);
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

  public drawDividerAt(y: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#3c4043';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(this.vWidth - 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawDivider(): void {
    this.drawDividerAt(255);
  }

  private drawTrack(
    groundY: number,
    distance: number,
    player: PlayerVisualState,
    obstacles: Obstacle[],
    label: string,
    accentColor: string,
    isLocal: boolean,
    isCountdown: boolean,
    scale: number = 1.0,
    topY: number = 0,
    trackHeight: number = 270
  ): void {
    const ctx = this.ctx;
    const spriteImg = this.spriteManager.getImage('/offline-sprite-dark.png');
    const dinoScreenX = Math.round(60 * (scale < 1.0 ? Math.max(0.7, scale) : 1.0));

    // Track Header: Classic Chrome Dino Minimalist typography
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const headerFontSize = Math.max(8, Math.round(12 * scale));
    const headerFont = `bold ${headerFontSize}px "Press Start 2P", monospace`;
    const headerY = topY + Math.max(6, Math.round(10 * scale));

    // Highlight Box for Local Player Track
    if (isLocal) {
      const boxW = Math.min(380, Math.round(380 * scale));
      const boxH = Math.max(18, Math.round(26 * scale));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(18, headerY - 3, boxW, boxH);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(18, headerY - 3, boxW, boxH);

      ctx.font = headerFont;
      ctx.fillStyle = accentColor;
      ctx.fillText(`${label}: ${player.name.substring(0, 13)}`, 28, headerY + 1);
    } else {
      ctx.font = headerFont;
      ctx.fillStyle = accentColor;
      ctx.fillText(`${label}: ${player.name.substring(0, 13)}`, 28, headerY + 1);
    }

    // Classic 5-digit Distance Counter on the right
    ctx.textAlign = 'right';
    const scoreFontSize = Math.max(9, Math.round(14 * scale));
    ctx.font = `bold ${scoreFontSize}px "Press Start 2P", monospace`;
    ctx.fillStyle = '#acacac';
    const scoreStr = Math.floor(distance / 10).toString().padStart(5, '0');
    ctx.fillText(`${scoreStr} PTS`, this.vWidth - 30, headerY + 1);

    // Drifting authentic clouds in the sky
    if (spriteImg) {
      const cloudSpeed = 0.12;
      const c1X = Math.round((850 - distance * cloudSpeed) % (this.vWidth + 100)) - 50;
      const c2X = Math.round((420 - distance * cloudSpeed * 0.8) % (this.vWidth + 100)) - 50;
      const c1Adjusted = c1X < -50 ? c1X + this.vWidth + 100 : c1X;
      const c2Adjusted = c2X < -50 ? c2X + this.vWidth + 100 : c2X;

      const cW = Math.round(46 * scale);
      const cH = Math.round(14 * scale);
      ctx.drawImage(spriteImg, CHROMIUM_SPRITES.CLOUD.x, CHROMIUM_SPRITES.CLOUD.y, 46, 14, c1Adjusted, groundY - Math.round(115 * scale), cW, cH);
      ctx.drawImage(spriteImg, CHROMIUM_SPRITES.CLOUD.x, CHROMIUM_SPRITES.CLOUD.y, 46, 14, c2Adjusted, groundY - Math.round(80 * scale), cW, cH);
    }

    // Authentic Chrome Dino Ground Horizon line: repeating 600px pattern
    if (spriteImg) {
      const horizonW = 600;
      const scrollOffset = Math.floor(distance) % horizonW;
      const hH = Math.round(12 * scale);
      for (let hx = 20 - scrollOffset; hx < this.vWidth; hx += horizonW) {
        ctx.drawImage(spriteImg, CHROMIUM_SPRITES.HORIZON.x, CHROMIUM_SPRITES.HORIZON.y, 600, 12, hx, groundY - Math.round(4 * scale), 600, hH);
      }
    } else {
      ctx.strokeStyle = '#535353';
      ctx.lineWidth = Math.max(1, Math.round(2 * scale));
      ctx.beginPath();
      ctx.moveTo(20, groundY);
      ctx.lineTo(this.vWidth - 20, groundY);
      ctx.stroke();
    }

    // Obstacles: O(log N) binary search culling to visible track window
    const minTrackX = distance - dinoScreenX - 60;
    const maxTrackX = distance - dinoScreenX + this.vWidth + 40;
    findVisibleObstacleRange(obstacles, minTrackX, maxTrackX, this.renderObstacleRange);

    for (let i = this.renderObstacleRange.startIndex; i < this.renderObstacleRange.endIndex; i++) {
      const obs = obstacles[i];
      const screenX = obs.x - distance + dinoScreenX;
      if (screenX < -60 || screenX > this.vWidth + 40) continue;
      this.drawObstacle(obs, screenX, groundY, scale);
    }

    // Dino
    this.drawDino(player, dinoScreenX, groundY, scale);

    // If player crashed
    if (player.isDead) {
      ctx.fillStyle = 'rgba(32, 33, 36, 0.65)';
      ctx.fillRect(20, topY, this.vWidth - 40, trackHeight);

      ctx.fillStyle = '#e74c3c';
      ctx.font = `bold ${Math.max(10, Math.round(15 * scale))}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('CRASH', dinoScreenX + Math.round(30 * scale), groundY - Math.round(45 * scale));
    }
  }

  private drawDino(player: PlayerVisualState, x: number, groundY: number, scale: number = 1.0): void {
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
    const renderWidth = Math.round((resolved.renderWidth || 44) * scale);
    const renderHeight = Math.round((resolved.renderHeight || 47) * scale);
    const screenY = groundY - renderHeight - Math.round(player.y * scale);

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

    // Floating Nickname Badge strictly above the dinosaur
    this.drawDinoNickBadge(player, x, renderWidth || 44, renderHeight, groundY, scale);
  }

  private drawDinoNickBadge(
    player: PlayerVisualState,
    x: number,
    dinoWidth: number,
    dinoHeight: number,
    groundY: number,
    scale: number = 1.0
  ): void {
    const ctx = this.ctx;
    const clearance = Math.max(8, Math.round(14 * scale));
    const badgePos = calculateDinoNameBadgePos({
      groundY,
      dinoHeight,
      jumpY: Math.round(player.y * scale),
      dinoScreenX: x,
      dinoWidth,
      clearance,
    });

    const cleanName = sanitizeTextNoEmojis(player.name.substring(0, 12)).toUpperCase();
    const displayName = cleanName || (player.isLocal ? 'TU DINO' : 'RIVAL');

    const fontSize = Math.max(7, Math.round(9 * scale));
    ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // High-contrast dark outline ensuring 100% legibility over clouds and background
    ctx.strokeStyle = '#101112';
    ctx.lineWidth = Math.max(2, Math.round(3 * scale));
    ctx.lineJoin = 'miter';
    ctx.strokeText(displayName, badgePos.x, badgePos.y);

    // Player's chosen customized color
    ctx.fillStyle = player.color || '#ffffff';
    ctx.fillText(displayName, badgePos.x, badgePos.y);
  }

  private drawObstacle(obs: Obstacle, screenX: number, groundY: number, scale: number = 1.0): void {
    const ctx = this.ctx;
    const obsW = Math.round(obs.width * scale);
    const obsH = Math.round(obs.height * scale);
    const screenY = groundY - obsH - Math.round(obs.y * scale);
    const img = this.spriteManager.getImage('/offline-sprite-dark.png');

    if (img) {
      if (obs.type === 'CACTUS_SMALL') {
        const s = CHROMIUM_SPRITES.CACTUS_SMALL;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, obsW, obsH);
        return;
      } else if (obs.type === 'CACTUS_DOUBLE') {
        const s = CHROMIUM_SPRITES.CACTUS_DOUBLE;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, obsW, obsH);
        return;
      } else if (obs.type === 'CACTUS_LARGE') {
        const s = CHROMIUM_SPRITES.CACTUS_LARGE;
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, obsW, obsH);
        return;
      } else {
        // Pterodactyl wings flap at authentic cadence (alternating every 180ms)
        const wingFrame = getPterodactylWingFrame(Date.now());
        const s = CHROMIUM_SPRITES.PTERODACTYL[wingFrame] || CHROMIUM_SPRITES.PTERODACTYL[0];
        ctx.drawImage(img, s.x, s.y, s.w, s.h, screenX, screenY, obsW, obsH);
        return;
      }
    }

    // Monochrome Fallback if image not ready yet
    ctx.fillStyle = '#acacac';
    ctx.fillRect(screenX, screenY, obsW, obsH);
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
    ctx.fillStyle = 'rgba(32, 33, 36, 0.60)';
    ctx.fillRect(0, 0, this.vWidth, this.vHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.vWidth / 2, this.vHeight / 2 - 40);

    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillText('¡PREPÁRENSE PARA CORRER!', this.vWidth / 2, this.vHeight / 2 + 25);

    ctx.fillStyle = '#70757a';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('[ESPACIO / ARRIBA]: SALTAR   |   [ABAJO]: AGACHARSE', this.vWidth / 2, this.vHeight / 2 + 65);
  }

  private drawSpectatingOverlay(myDistance: number, layout?: MultiTrackLayout, tracks?: TrackRenderData[]): void {
    const ctx = this.ctx;
    if (layout && tracks && layout.numTracks > 2) {
      const localIdx = tracks.findIndex(t => t.isLocal);
      const slotTop = localIdx >= 0 ? layout.topBoundaries[localIdx] : 0;
      ctx.fillStyle = 'rgba(32, 33, 36, 0.78)';
      ctx.fillRect(0, slotTop, this.vWidth, layout.trackHeight);

      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G A M E   O V E R', this.vWidth / 2, slotTop + Math.round(layout.trackHeight * 0.35));

      ctx.fillStyle = '#f1c40f';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`CHOCASTE A LOS ${myDistance}m • ESPECTANDO A LOS DEMÁS`, this.vWidth / 2, slotTop + Math.round(layout.trackHeight * 0.65));
      return;
    }

    // Default 2-track overlay (exact existing behavior)
    ctx.fillStyle = 'rgba(32, 33, 36, 0.78)';
    ctx.fillRect(0, 0, this.vWidth, 255);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 22px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G A M E   O V E R', this.vWidth / 2, 65);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText(`CHOCASTE CON ${myDistance} PUNTOS`, this.vWidth / 2, 105);

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
    ctx.fillText(`TÚ: ${myDistance} pts   vs   ${rivalName}: ${rivalDistance} pts`, this.vWidth / 2, this.vHeight / 2 + 25);

    const diff = myDistance - rivalDistance;
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(`+${diff} PUNTOS DE VENTAJA`, this.vWidth / 2, this.vHeight / 2 + 45);

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
    ctx.fillText(`TÚ: ${myDistance} pts   vs   ${rivalName}: ${rivalDistance} pts`, this.vWidth / 2, this.vHeight / 2 + 25);

    const diff = rivalDistance - myDistance;
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(`-${diff} PUNTOS DE DIFERENCIA`, this.vWidth / 2, this.vHeight / 2 + 45);

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
    ctx.fillText(`AMBOS EMPATARON CON ${distance} PUNTOS`, this.vWidth / 2, this.vHeight / 2 + 10);

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
    ctx.fillText(`PUNTAJE: ${distance} PTS`, this.vWidth / 2, this.vHeight / 2 - 20);

    if (highScore > 0) {
      ctx.fillStyle = distance >= highScore ? '#f1c40f' : '#acacac';
      ctx.font = '11px "Press Start 2P", monospace';
      const recordLabel = distance >= highScore ? '¡NUEVO RÉCORD!' : `RÉCORD: ${highScore} PTS`;
      ctx.fillText(recordLabel, this.vWidth / 2, this.vHeight / 2 + 15);
    }

    ctx.fillStyle = '#70757a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText('PULSA [ESPACIO / ENTER] O [JUGAR DE NUEVO]', this.vWidth / 2, this.vHeight / 2 + 65);
  }
}
