import { describe, it, expect } from 'vitest';
import {
  calculateDinoNameBadgePos,
  formatMatchComparison,
  sanitizeTextNoEmojis,
  resolveDinoRenderFrame,
  getPterodactylWingFrame,
} from '../src/render/ui-helpers';
import { SKINS } from '../src/render/sprites';

describe('In-game UI Helpers & Nick Badge', () => {
  it('calculates name badge position strictly above the dino without covering/obscuring it', () => {
    const groundY = 220;
    const dinoHeight = 47; // normal height
    const jumpY = 30; // in air
    const dinoTopY = groundY - dinoHeight - jumpY; // 143

    const badgePos = calculateDinoNameBadgePos({
      groundY,
      dinoHeight,
      jumpY,
      dinoScreenX: 60,
      dinoWidth: 44,
    });

    // Badge X must be centered over dino
    expect(badgePos.x).toBe(60 + 22);

    // Badge Y must be strictly ABOVE the dino head by at least 10px clearance
    expect(badgePos.y).toBeLessThan(dinoTopY);
    expect(dinoTopY - badgePos.y).toBeGreaterThanOrEqual(10);
  });

  it('adjusts badge height accurately when dino is ducking', () => {
    const groundY = 220;
    const standingHeight = 47;
    const duckingHeight = 30;
    const jumpY = 0;

    const standingPos = calculateDinoNameBadgePos({
      groundY,
      dinoHeight: standingHeight,
      jumpY,
      dinoScreenX: 60,
      dinoWidth: 44,
    });

    const duckingPos = calculateDinoNameBadgePos({
      groundY,
      dinoHeight: duckingHeight,
      jumpY,
      dinoScreenX: 60,
      dinoWidth: 59,
    });

    // When ducking, head is lower, so badge is also lower (larger Y)
    expect(duckingPos.y).toBeGreaterThan(standingPos.y);
    // And still maintains at least 10px clearance above ducking head
    const duckingTopY = groundY - duckingHeight;
    expect(duckingTopY - duckingPos.y).toBeGreaterThanOrEqual(10);
  });

  it('sanitizes strings ensuring zero emojis exist in the UI text', () => {
    const dirty1 = '🏆 ¡RIVAL ELIMINADO! CORRE POR EL RÉCORD 🏆';
    const clean1 = sanitizeTextNoEmojis(dirty1);
    expect(clean1).not.toMatch(/[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF]/);
    expect(clean1).toBe('¡RIVAL ELIMINADO! CORRE POR EL RÉCORD');

    const dirty2 = '🤖 JUGAR CONTRA BOT';
    const clean2 = sanitizeTextNoEmojis(dirty2);
    expect(clean2).toBe('JUGAR CONTRA BOT');
  });

  it('formats match comparison with clear metrics and no emojis', () => {
    const victoryComparison = formatMatchComparison(540, 320, 'Rival');
    expect(victoryComparison.diffText).toBe('+220 METROS DE VENTAJA');
    expect(victoryComparison.detailText).toBe('TÚ: 540 m   vs   Rival: 320 m');
    expect(victoryComparison.diffText).not.toMatch(/[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF]/);

    const defeatComparison = formatMatchComparison(320, 540, 'Bot');
    expect(defeatComparison.diffText).toBe('-220 METROS DE DIFERENCIA');
    expect(defeatComparison.detailText).toBe('TÚ: 320 m   vs   Bot: 540 m');
  });

  it('renders authentic 1:1 ducking animation frames without scaling or squashing the dinosaur', () => {
    const classicSkin = SKINS.classic;

    // 1. Normal running on ground: native 1:1 dimensions (44x47)
    const runningFrame = resolveDinoRenderFrame(classicSkin, false, false, true, 100);
    expect(runningFrame.renderWidth).toBe(44);
    expect(runningFrame.renderHeight).toBe(47);
    expect(runningFrame.spriteRect).toEqual(classicSkin.run[0]);

    // 2. Ducking on ground: native 1:1 dimensions (59x30), NOT squashed
    const duckingGround = resolveDinoRenderFrame(classicSkin, false, true, true, 100);
    expect(duckingGround.renderWidth).toBe(59);
    expect(duckingGround.renderHeight).toBe(30);
    expect(duckingGround.spriteRect).toEqual(classicSkin.duck[0]);

    // 3. Ducking in mid-air (fast fall): displays authentic ducking frame at 1:1 (59x30), NOT squashed idle (28x30)
    const duckingAir = resolveDinoRenderFrame(classicSkin, false, true, false, 100);
    expect(duckingAir.renderWidth).toBe(59);
    expect(duckingAir.renderHeight).toBe(30);
    expect(duckingAir.spriteRect).toEqual(classicSkin.duck[0]);

    // 4. Jumping without ducking: normal idle in air (44x47)
    const jumpingNormal = resolveDinoRenderFrame(classicSkin, false, false, false, 100);
    expect(jumpingNormal.renderWidth).toBe(44);
    expect(jumpingNormal.renderHeight).toBe(47);
    expect(jumpingNormal.spriteRect).toEqual(classicSkin.idle);

    // 5. Custom skin (Party skin): preserves skin-specific ducking frame (59x43)
    const partySkin = SKINS.party;
    const partyDucking = resolveDinoRenderFrame(partySkin, false, true, true, 100);
    expect(partyDucking.renderWidth).toBe(59);
    expect(partyDucking.renderHeight).toBe(43);
    expect(partyDucking.spriteRect).toEqual(partySkin.duck[0]);
  });

  it('alternates pterodactyl wing frames smoothly over time', () => {
    // Frame 0 at start
    expect(getPterodactylWingFrame(0)).toBe(0);
    expect(getPterodactylWingFrame(100)).toBe(0);
    expect(getPterodactylWingFrame(179)).toBe(0);

    // Frame 1 after 180ms
    expect(getPterodactylWingFrame(180)).toBe(1);
    expect(getPterodactylWingFrame(250)).toBe(1);
    expect(getPterodactylWingFrame(359)).toBe(1);

    // Frame 0 after 360ms
    expect(getPterodactylWingFrame(360)).toBe(0);
    expect(getPterodactylWingFrame(500)).toBe(0);

    // Continuous 2-frame flapping
    expect(getPterodactylWingFrame(540)).toBe(1);
  });
});

