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
