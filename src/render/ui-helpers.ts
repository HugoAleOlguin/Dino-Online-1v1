import { SpriteRect, SkinAnimationSet } from './sprites';

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


