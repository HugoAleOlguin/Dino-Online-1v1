import { describe, it, expect } from 'vitest';
import { BotSimulator, createRandomBotProfile } from '../src/core/bot-simulator';

describe('BotSimulator', () => {
  it('should generate a valid bot profile with distinct name, color and skin', () => {
    const profile = createRandomBotProfile(1);
    expect(profile.name).toContain('Bot');
    expect(profile.color).toBeDefined();
    expect(profile.skinId).toBeDefined();
  });

  it('should update bot physics and jump when triggered', () => {
    const bot = new BotSimulator('bot-1', createRandomBotProfile(1));
    expect(bot.state.isGrounded).toBe(true);
    expect(bot.state.y).toBe(0);

    bot.jump();
    expect(bot.state.isGrounded).toBe(false);
    expect(bot.state.vy).toBeGreaterThan(0);

    bot.update(1 / 60, 360, []);
    expect(bot.state.y).toBeGreaterThan(0);
  });

  it('should support spectating state', () => {
    const bot = new BotSimulator('bot-spectator', createRandomBotProfile(2), true);
    expect(bot.isSpectating).toBe(true);
    expect(bot.state.isDead).toBe(true);

    bot.resetForNewMatch();
    expect(bot.isSpectating).toBe(false);
    expect(bot.state.isDead).toBe(false);
    expect(bot.state.distance).toBe(0);
  });

  it('should react to nearby obstacles by jumping or ducking', () => {
    const bot = new BotSimulator('bot-ai', createRandomBotProfile(3));
    // Simulate obstacle approaching
    const fakeObstacles = [
      {
        x: 120, // close to dino at x=50
        y: 0,
        width: 34,
        height: 70,
        type: 'CACTUS_LARGE' as const,
        speedRatio: 1,
      },
    ];

    bot.evaluateObstacles(fakeObstacles, 360);
    expect(bot.state.isGrounded).toBe(false); // jumped!
  });
});
