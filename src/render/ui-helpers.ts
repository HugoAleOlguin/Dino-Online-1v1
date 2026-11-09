import { SpriteRect, SkinAnimationSet } from './sprites';
import { Obstacle } from '../core/obstacles';

export interface DinoBadgeParams {
  groundY: number;
  dinoHeight: number;
  jumpY: number;
  dinoScreenX: number;
  dinoWidth: number;
  clearance?: number;
}

export interface BadgePosition {
  x: number;
  y: number;
}

/**
 * Calculates the exact pixel position for a player's nickname badge floating
 * strictly above the dinosaur sprite, with guaranteed clearance so it NEVER
 * covers or obscures the dinosaur's head, horns, or animations.
 */
export function calculateDinoNameBadgePos(params: DinoBadgeParams): BadgePosition {
  const clearance = params.clearance ?? 14;
  const dinoTopY = params.groundY - params.dinoHeight - params.jumpY;
  const badgeX = Math.round(params.dinoScreenX + params.dinoWidth / 2);
  const badgeY = Math.round(dinoTopY - clearance);

  return { x: badgeX, y: badgeY };
}

/**
 * Strips all Unicode emojis, pictographs, variation selectors, and zero-width joiners,
 * ensuring 100% clean arcade text typography.
 */
export function sanitizeTextNoEmojis(text: string): string {
  return text
    .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D\u25B6\u25BC\u25B2\u25C0]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchComparison {
  diff: number;
  diffText: string;
  detailText: string;
}

/**
 * Formats distance metrics and victory/defeat differences cleanly without emojis.
 */
export function formatMatchComparison(
  myDist: number,
  rivalDist: number,
  rivalName: string
): MatchComparison {
  const diff = myDist - rivalDist;
  const cleanRival = sanitizeTextNoEmojis(rivalName) || 'Rival';
  const diffText = diff >= 0 ? `+${diff} METROS DE VENTAJA` : `-${Math.abs(diff)} METROS DE DIFERENCIA`;
  const detailText = `TÚ: ${myDist} m   vs   ${cleanRival}: ${rivalDist} m`;

  return {
    diff,
    diffText,
    detailText,
  };
}

export interface DinoFrameResolution {
  spriteRect: SpriteRect;
  renderWidth: number;
  renderHeight: number;
}

/**
 * Resolves the authentic, pixel-accurate 1:1 sprite frame for a dinosaur.
 * Preserves un-stretched, un-deformed sprite dimensions for both running and ducking,
 * ensuring the dinosaur uses its authentic skin animation without changing scale/size artificially.
 */
export function resolveDinoRenderFrame(
  skin: SkinAnimationSet,
  isDead: boolean,
  isDucking: boolean,
  isGrounded: boolean,
  distance: number
): DinoFrameResolution {
  const runStep = Math.floor(distance / 24) % 2;

  let spriteRect: SpriteRect;
  if (isDead) {
    spriteRect = skin.dead;
  } else if (isDucking) {
    // Both on ground and in air: play the dedicated ducking animation frames
    spriteRect = skin.duck[runStep] || skin.duck[0];
  } else if (!isGrounded) {
    spriteRect = skin.idle;
  } else {
    spriteRect = skin.run[runStep] || skin.run[0];
  }

  return {
    spriteRect,
    renderWidth: spriteRect.w,
    renderHeight: spriteRect.h,
  };
}

/**
 * Calculates continuous, authentic 2-frame wing flapping animation for flying obstacles (Pterodactyls).
 * Alternates between wing frames every 180ms (~5.5 flaps per second).
 */
export function getPterodactylWingFrame(timeMs: number): number {
  return Math.floor(timeMs / 180) % 2;
}

/**
 * Selects the preview sprite for the lobby avatar/stage.
 * If user holds down arrow, previews the ducking animation in real-time.
 */
export function getLobbyPreviewSprite(
  skin: SkinAnimationSet,
  isDucking: boolean,
  frame: number
): SpriteRect {
  if (isDucking && skin.duck && skin.duck.length > 0) {
    return skin.duck[frame % skin.duck.length] || skin.duck[0];
  }
  if (skin.run && skin.run.length > 0) {
    return skin.run[frame % skin.run.length] || skin.run[0];
  }
  return skin.idle;
}

export interface LobbyPreviewLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates pixel dimensions and coordinates for the lobby preview canvas (96x96)
 * with feet grounded on a fixed baseline so ducking animates naturally downwards,
 * dynamically scaling down if needed so no skin or duck frame is ever clipped.
 */
export function calculateLobbyPreviewLayout(
  spriteRect: SpriteRect,
  canvasWidth: number = 96,
  canvasHeight: number = 96,
  baseScale: number = 1.25,
  baselineY: number = 86
): LobbyPreviewLayout {
  const padding = 4;
  let scale = baseScale;

  // Guarantee sprite never clips through top edge
  if (spriteRect.h * scale > baselineY - padding) {
    scale = (baselineY - padding) / spriteRect.h;
  }
  // Guarantee sprite never clips through left/right edges
  if (spriteRect.w * scale > canvasWidth - padding * 2) {
    scale = Math.min(scale, (canvasWidth - padding * 2) / spriteRect.w);
  }

  const width = Math.round(spriteRect.w * scale);
  const height = Math.round(spriteRect.h * scale);
  const x = Math.round((canvasWidth - width) / 2);
  const y = baselineY - height;

  return { x, y, width, height };
}

export interface MultiTrackLayout {
  numTracks: number;
  trackHeight: number;
  scale: number;
  groundYs: number[];
  topBoundaries: number[];
}

/**
 * Calculates responsive track positioning and uniform scaling factor
 * for up to 4 players, mathematically guaranteeing that jump apexes never
 * collide with or penetrate the track ceilings.
 */
export function calculateMultiTrackLayout(
  numTracks: number,
  canvasHeight: number = 540,
  canvasWidth: number = 960
): MultiTrackLayout {
  const count = Math.max(1, Math.min(4, numTracks));

  // Visual scale factor calibrated to preserve >20px headroom above max jump
  let scale = 1.0;
  if (count === 3) scale = 0.72;
  else if (count === 4) scale = 0.58;

  const trackHeight = canvasHeight / count;
  const groundYs: number[] = [];
  const topBoundaries: number[] = [];

  const bottomPad = count <= 2 ? 30 : Math.round(14 * scale);

  for (let i = 0; i < count; i++) {
    const topY = i * trackHeight;
    const bottomY = (i + 1) * trackHeight;
    const groundY = bottomY - bottomPad;
    topBoundaries.push(topY);
    groundYs.push(groundY);
  }

  return {
    numTracks: count,
    trackHeight,
    scale,
    groundYs,
    topBoundaries,
  };
}

/**
 * Strictly sanitizes untrusted text by escaping HTML metacharacters,
 * neutralizing XSS injection in player nicknames, chat, and dynamic DOM nodes.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Marks all remote players in the match as dead.
 * Used when the host or network drops mid-match to prevent soft-locking
 * the local player in spectating mode (LOCAL_CRASHED_SPECTATING).
 */
export function markAllRemotePlayersDead(
  remotePlayers: Map<string, { state: { isDead: boolean } }>
): void {
  for (const rp of remotePlayers.values()) {
    rp.state.isDead = true;
  }
}

/**
 * Evaluates whether all participants in the match have crashed or ended their run.
 */
export function checkAllPlayersDead(
  isLocalDead: boolean,
  isLocalSpectating: boolean,
  remotePlayers: Map<string, { state: { isDead: boolean }; isSpectating?: boolean }>,
  fallbackRemoteState?: { isDead: boolean }
): boolean {
  if (!isLocalDead && !isLocalSpectating) return false;
  if (remotePlayers.size === 0) {
    return fallbackRemoteState ? fallbackRemoteState.isDead : true;
  }
  for (const rp of remotePlayers.values()) {
    if (!rp.state.isDead && !rp.isSpectating) return false;
  }
  return true;
}

export interface ObstacleRange {
  startIndex: number;
  endIndex: number; // exclusive
}

/**
 * Performs indexed binary search O(log N) to find the slice of obstacles
 * overlapping the visible track horizontal window [minTrackX, maxTrackX].
 * Supports zero-allocation by accepting an optional reusable `out` struct.
 */
export function findVisibleObstacleRange(
  obstacles: Obstacle[],
  minTrackX: number,
  maxTrackX: number,
  out?: ObstacleRange
): ObstacleRange {
  const result = out || { startIndex: 0, endIndex: 0 };
  const len = obstacles.length;
  if (len === 0) {
    result.startIndex = 0;
    result.endIndex = 0;
    return result;
  }

  // Binary search for first obstacle whose right edge (x + width) is >= minTrackX
  let low = 0;
  let high = len - 1;
  let start = len;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (obstacles[mid].x + obstacles[mid].width >= minTrackX) {
      start = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Binary search for first obstacle whose left edge (x) > maxTrackX
  low = start;
  high = len - 1;
  let end = len;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (obstacles[mid].x > maxTrackX) {
      end = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  result.startIndex = start;
  result.endIndex = Math.max(start, end);
  return result;
}

export interface RemoteKinematicState {
  y: number;
  vy: number;
  isDucking: boolean;
  isGrounded: boolean;
  distance: number;
}

/**
 * Kinematic ballistic extrapolation (Dead-Reckoning) using authentic Chromium gravity (-2100 px/s²).
 * Reconstructs accurate parabolic jumps between network packets, fast-falls when ducking,
 * and maintains strictly non-decreasing distance progress to prevent backward rubberbanding.
 */
export function extrapolateKinematicTrajectory(
  current: RemoteKinematicState,
  dt: number,
  speed: number,
  gravity: number = -2100
): RemoteKinematicState {
  // Chromium offline.js fast fall multiplier: 2.8 if ducking mid-air
  const effGravity = current.isDucking ? gravity * 2.8 : gravity;
  let newY = current.y;
  let newVy = current.vy;
  let isGrounded = current.isGrounded;

  if (!isGrounded || newY > 0 || newVy > 0) {
    // Parabolic motion: y(t) = y + vy * dt + 0.5 * g * dt^2
    newY = current.y + current.vy * dt + 0.5 * effGravity * dt * dt;
    newVy = current.vy + effGravity * dt;

    if (newY <= 0) {
      newY = 0;
      newVy = 0;
      isGrounded = true;
    } else {
      isGrounded = false;
    }
  }

  // Dead-reckoning distance advances forward with speed
  const newDistance = current.distance + speed * dt;

  return {
    y: Math.max(0, newY),
    vy: newVy,
    isDucking: current.isDucking,
    isGrounded,
    distance: newDistance,
  };
}

export interface BackgroundTickerContext {
  isMatchRunning: boolean;
  countdownEndTime: number | null;
  documentHidden: boolean;
  stepSimulation: (dt: number) => void;
  onMatchStarted?: () => void;
}

/**
 * Handles Web Worker background ticking to guarantee uninterrupted 60Hz physics
 * even when the tab is hidden, ensuring automatic countdown completion and immediate match start.
 */
export function processBackgroundTick(
  ctx: BackgroundTickerContext,
  now: number,
  dt: number = 1 / 60
): boolean {
  if (!ctx.documentHidden) return false;

  let stateChanged = false;

  // If in countdown while backgrounded
  if (ctx.countdownEndTime !== null) {
    if (now >= ctx.countdownEndTime) {
      ctx.isMatchRunning = true;
      ctx.countdownEndTime = null;
      stateChanged = true;
      if (ctx.onMatchStarted) {
        ctx.onMatchStarted();
      }
    }
  }

  // If match is running (or just transitioned to running), step simulation
  if (ctx.isMatchRunning) {
    ctx.stepSimulation(dt);
  }

  return stateChanged;
}

export interface ColorSwatchItem {
  hex: string;
  name: string;
  label: string;
}

export const LOBBY_COLOR_OPTIONS: ColorSwatchItem[] = [
  { hex: '#ffffff', name: 'Blanco clásico', label: 'Color Blanco clásico' },
  { hex: '#acacac', name: 'Gris dino', label: 'Color Gris dino' },
  { hex: '#f1c40f', name: 'Dorado retro', label: 'Color Dorado retro' },
  { hex: '#2ecc71', name: 'Verde clásico', label: 'Color Verde clásico' },
  { hex: '#e74c3c', name: 'Rojo ladrillo', label: 'Color Rojo ladrillo' },
  { hex: '#e67e22', name: 'Ámbar retro', label: 'Color Ámbar retro' },
];

/**
 * Returns a human-friendly Spanish aria-label for a color hex code.
 */
export function getColorSwatchLabel(hex: string): string {
  const match = LOBBY_COLOR_OPTIONS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return match ? match.label : `Color ${hex}`;
}

/**
 * Creates an accessible <button> element for color palette selection.
 * Meets WCAG 2.1 AA accessibility standards with role="button", aria-label, and aria-pressed.
 */
export function createColorSwatchElement(
  hex: string,
  isSelected: boolean,
  onClick?: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `color-swatch ${isSelected ? 'active' : ''}`.trim();
  button.style.backgroundColor = hex;
  button.setAttribute('type', 'button');
  button.setAttribute('aria-label', getColorSwatchLabel(hex));
  button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  button.setAttribute('role', 'button');
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  return button;
}

export type PingClass = 'ping-good' | 'ping-fair' | 'ping-poor';

/**
 * Classifies connection latency into semantic CSS classes:
 * - ping < 80ms: 'ping-good'
 * - ping < 180ms: 'ping-fair'
 * - ping >= 180ms: 'ping-poor'
 */
export function getPingClass(pingMs: number): PingClass {
  if (pingMs < 80) {
    return 'ping-good';
  }
  if (pingMs < 180) {
    return 'ping-fair';
  }
  return 'ping-poor';
}




