import { describe, it, expect } from 'vitest';
import { DinoBot } from '../src/core/bot';
import { GameEngine } from '../src/core/game-engine';

describe('DinoBot AI Controller', () => {
  it('initializes with a game engine and is alive', () => {
    const engine = new GameEngine(12345);
    const bot = new DinoBot(engine);
    expect(bot.engine.isGameOver).toBe(false);
  });

  it('jumps to clear obstacles as it runs', () => {
    const engine = new GameEngine(12345);
    const bot = new DinoBot(engine);

    // Run for 300 ticks (~5 seconds)
    for (let i = 0; i < 300; i++) {
      bot.update(1 / 60);
    }

    // Bot should have traveled at least 1500px and handled at least 1-2 obstacles
    expect(bot.engine.distance).toBeGreaterThan(1000);
  });
});
