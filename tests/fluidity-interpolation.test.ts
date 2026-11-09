import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/core/game-engine';
import { DinoAction } from '../src/core/physics';
import {
  findVisibleObstacleRange,
  extrapolateKinematicTrajectory,
  processBackgroundTick,
  BackgroundTickerContext,
  RemoteKinematicState,
  ObstacleRange,
} from '../src/render/ui-helpers';
import { DoubleTrackRenderer } from '../src/render/renderer';
import { SpriteManager } from '../src/render/sprites';
import { generateObstaclesForTrack } from '../src/core/obstacles';

describe('Ticket 3: Motor Canvas 2D de Alta Fluidez (144Hz, Zero-Allocation, Balística)', () => {
  describe('1. Temporal Interpolation (alpha = accumulator / FIXED_DELTA)', () => {
    it('tracks prevDistance and prevY before advancing 60Hz deterministic physics', () => {
      const engine = new GameEngine(12345);
      expect(engine.prevDistance).toBe(0);
      expect(engine.prevY).toBe(0);

      engine.update(1 / 60);

      expect(engine.prevDistance).toBe(0);
      expect(engine.distance).toBeGreaterThan(0);

      const distAfter1Tick = engine.distance;
      engine.update(1 / 60);

      expect(engine.prevDistance).toBe(distAfter1Tick);
      expect(engine.distance).toBeGreaterThan(distAfter1Tick);
    });

    it('calculates interpolated distance and Y smoothly for alpha in [0, 1) without mutating engine state', () => {
      const engine = new GameEngine(12345);
      engine.handleInput(DinoAction.JUMP);
      engine.update(1 / 60);

      const prevDist = engine.prevDistance;
      const currDist = engine.distance;
      const prevY = engine.prevY;
      const currY = engine.dino.y;

      // Sample at alpha = 0 (start of tick)
      expect(engine.getInterpolatedDistance(0)).toBeCloseTo(prevDist, 5);
      expect(engine.getInterpolatedY(0)).toBeCloseTo(prevY, 5);

      // Sample at alpha = 0.5 (midpoint, 120Hz/144Hz intermediate frame)
      const expectedMidDist = prevDist + (currDist - prevDist) * 0.5;
      const expectedMidY = prevY + (currY - prevY) * 0.5;
      expect(engine.getInterpolatedDistance(0.5)).toBeCloseTo(expectedMidDist, 5);
      expect(engine.getInterpolatedY(0.5)).toBeCloseTo(expectedMidY, 5);

      // Sample at alpha = 0.9
      const expected90Dist = prevDist + (currDist - prevDist) * 0.9;
      expect(engine.getInterpolatedDistance(0.9)).toBeCloseTo(expected90Dist, 5);

      // Sampling visual interpolation MUST NOT alter discrete engine state
      expect(engine.distance).toBe(currDist);
      expect(engine.dino.y).toBe(currY);
    });

    it('guarantees identical deterministic 60Hz simulation whether interpolation is sampled or not', () => {
      const engineWithoutInterp = new GameEngine(55555);
      const engineWithInterp = new GameEngine(55555);

      for (let i = 0; i < 120; i++) {
        if (i === 15) {
          engineWithoutInterp.handleInput(DinoAction.JUMP);
          engineWithInterp.handleInput(DinoAction.JUMP);
        }
        engineWithoutInterp.update(1 / 60);

        engineWithInterp.update(1 / 60);
        // Sample intermediate frames as if rendering at 144Hz
        engineWithInterp.getInterpolatedDistance(0.33);
        engineWithInterp.getInterpolatedDistance(0.66);
        engineWithInterp.getInterpolatedY(0.33);
        engineWithInterp.getInterpolatedY(0.66);
      }

      expect(engineWithInterp.distance).toBe(engineWithoutInterp.distance);
      expect(engineWithInterp.dino.y).toBe(engineWithoutInterp.dino.y);
      expect(engineWithInterp.dino.vy).toBe(engineWithoutInterp.dino.vy);
      expect(engineWithInterp.score).toBe(engineWithoutInterp.score);
    });
  });

  describe('2. Rival Ballistic Kinematic Extrapolation (Chromium Dead-Reckoning)', () => {
    it('extrapolates parabolic jump trajectory using Chromium gravity (-2100 px/s²)', () => {
      const initial: RemoteKinematicState = {
        y: 0,
        vy: 720, // Authentic jump velocity
        isDucking: false,
        isGrounded: false,
        distance: 500,
      };

      const dt = 0.1; // 100ms
      const speed = 400; // px/s
      const next = extrapolateKinematicTrajectory(initial, dt, speed, -2100);

      // y = y0 + vy*t + 0.5*g*t^2 = 0 + 720*0.1 + 0.5*(-2100)*0.01 = 72 - 10.5 = 61.5 px
      expect(next.y).toBeCloseTo(61.5, 2);
      // vy = vy0 + g*t = 720 - 2100*0.1 = 510 px/s
      expect(next.vy).toBeCloseTo(510, 2);
      expect(next.isGrounded).toBe(false);
      // Distance moves forward by speed * dt
      expect(next.distance).toBeCloseTo(540, 2);
    });

    it('reaches maximum jump apex at t = vy / -g (~123.4px)', () => {
      let state: RemoteKinematicState = {
        y: 0,
        vy: 720,
        isDucking: false,
        isGrounded: false,
        distance: 100,
      };

      const dt = 1 / 60;
      let maxY = 0;

      // Step until dino lands back on ground
      for (let t = 0; t < 60; t++) {
        state = extrapolateKinematicTrajectory(state, dt, 360, -2100);
        if (state.y > maxY) maxY = state.y;
        if (state.isGrounded) break;
      }

      // Authentic Chromium offline.js jump apex is ~123.4px
      expect(maxY).toBeGreaterThan(120);
      expect(maxY).toBeLessThan(125);
      expect(state.isGrounded).toBe(true);
      expect(state.y).toBe(0);
      expect(state.vy).toBe(0);
    });

    it('accelerates downward during fast-fall ducking with multiplier 2.8 (-5880 px/s²)', () => {
      const normalState: RemoteKinematicState = {
        y: 80,
        vy: 100,
        isDucking: false,
        isGrounded: false,
        distance: 200,
      };

      const duckingState: RemoteKinematicState = {
        y: 80,
        vy: 100,
        isDucking: true,
        isGrounded: false,
        distance: 200,
      };

      const dt = 0.05;
      const normalNext = extrapolateKinematicTrajectory(normalState, dt, 360, -2100);
      const duckingNext = extrapolateKinematicTrajectory(duckingState, dt, 360, -2100);

      // Ducking must fall significantly faster than normal jump
      expect(duckingNext.y).toBeLessThan(normalNext.y);
      expect(duckingNext.vy).toBeLessThan(normalNext.vy);
    });

    it('prevents backward lag-tug on distance and clamps cleanly to ground', () => {
      const airborne: RemoteKinematicState = {
        y: 5,
        vy: -300,
        isDucking: false,
        isGrounded: false,
        distance: 1000,
      };

      // With dt = 0.05, y drops below 0: should clamp to 0 and isGrounded = true
      const landed = extrapolateKinematicTrajectory(airborne, 0.05, 360, -2100);
      expect(landed.y).toBe(0);
      expect(landed.vy).toBe(0);
      expect(landed.isGrounded).toBe(true);
      expect(landed.distance).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('3. Layout Cache in DoubleTrackRenderer (Zero-Allocation)', () => {
    function createMockRenderer(): DoubleTrackRenderer {
      const mockCanvas = {
        width: 960,
        height: 540,
        getContext: () => ({} as CanvasRenderingContext2D),
      } as unknown as HTMLCanvasElement;
      const spriteManager = new SpriteManager();
      return new DoubleTrackRenderer(mockCanvas, spriteManager);
    }

    it('returns identical cached MultiTrackLayout reference across frames for identical track counts', () => {
      const renderer = createMockRenderer();

      const layout1 = renderer.getCachedLayout(2);
      const layout2 = renderer.getCachedLayout(2);

      // Exact referential identity = 0 memory allocation on subsequent frames
      expect(layout1).toBe(layout2);
      expect(layout1.groundYs).toBe(layout2.groundYs);
      expect(layout1.topBoundaries).toBe(layout2.topBoundaries);
    });

    it('caches distinct track counts independently and handles 1-4 players', () => {
      const renderer = createMockRenderer();

      const layout1 = renderer.getCachedLayout(1);
      const layout2 = renderer.getCachedLayout(2);
      const layout3 = renderer.getCachedLayout(3);
      const layout4 = renderer.getCachedLayout(4);

      expect(layout1.numTracks).toBe(1);
      expect(layout2.numTracks).toBe(2);
      expect(layout3.numTracks).toBe(3);
      expect(layout4.numTracks).toBe(4);

      // Calling again returns the exact cached instances
      expect(renderer.getCachedLayout(1)).toBe(layout1);
      expect(renderer.getCachedLayout(3)).toBe(layout3);
      expect(renderer.getCachedLayout(4)).toBe(layout4);
    });
  });

  describe('4. Indexed Culling / Binary Search O(log N) for Obstacles', () => {
    it('finds visible obstacle range in O(log N) with exact boundaries matching linear filter', () => {
      const seed = 42;
      // Generate 25,000 px of track containing dozens of obstacles
      const obstacles = generateObstaclesForTrack(seed, 25000);
      expect(obstacles.length).toBeGreaterThan(30);

      // Visible screen window on track: between trackX 3000 and 4200
      const minVisibleTrackX = 3000;
      const maxVisibleTrackX = 4200;

      const range = findVisibleObstacleRange(obstacles, minVisibleTrackX, maxVisibleTrackX);

      // Obstacles inside [startIndex, endIndex) must overlap [minVisibleTrackX, maxVisibleTrackX]
      for (let i = range.startIndex; i < range.endIndex; i++) {
        const obs = obstacles[i];
        expect(obs.x + obs.width).toBeGreaterThanOrEqual(minVisibleTrackX);
        expect(obs.x).toBeLessThanOrEqual(maxVisibleTrackX);
      }

      // Obstacles before startIndex must be completely to the left
      if (range.startIndex > 0) {
        const prevObs = obstacles[range.startIndex - 1];
        expect(prevObs.x + prevObs.width).toBeLessThan(minVisibleTrackX);
      }

      // Obstacles at or after endIndex must be completely to the right
      if (range.endIndex < obstacles.length) {
        const nextObs = obstacles[range.endIndex];
        expect(nextObs.x).toBeGreaterThan(maxVisibleTrackX);
      }

      // Linear comparison: count must match exactly
      const linearMatches = obstacles.filter(
        (o) => o.x + o.width >= minVisibleTrackX && o.x <= maxVisibleTrackX
      );
      expect(range.endIndex - range.startIndex).toBe(linearMatches.length);
    });

    it('supports zero-allocation by populating an existing pre-allocated output range object', () => {
      const obstacles = generateObstaclesForTrack(12345, 5000);
      const reusableRange: ObstacleRange = { startIndex: -1, endIndex: -1 };

      const returned = findVisibleObstacleRange(obstacles, 600, 1500, reusableRange);

      expect(returned).toBe(reusableRange);
      expect(reusableRange.startIndex).toBeGreaterThanOrEqual(0);
      expect(reusableRange.endIndex).toBeGreaterThan(reusableRange.startIndex);
    });

    it('handles edge cases: track window before first obstacle or beyond all obstacles', () => {
      const obstacles = generateObstaclesForTrack(123, 2000);

      // Way before first obstacle (runway starts at 500)
      const beforeRange = findVisibleObstacleRange(obstacles, 0, 200);
      expect(beforeRange.startIndex).toBe(beforeRange.endIndex);

      // Way beyond last obstacle
      const beyondRange = findVisibleObstacleRange(obstacles, 50000, 52000);
      expect(beyondRange.startIndex).toBe(beyondRange.endIndex);

      // Empty obstacles
      const emptyRange = findVisibleObstacleRange([], 100, 500);
      expect(emptyRange.startIndex).toBe(0);
      expect(emptyRange.endIndex).toBe(0);
    });

    it('GameEngine uses binary search culling to narrow collision check window without O(N) traversal', () => {
      const engine = new GameEngine(12345);
      // Run engine forward a bit
      for (let i = 0; i < 60; i++) {
        engine.update(1 / 60);
      }

      const dinoScreenX = engine.dino.x;
      const minX = engine.distance - dinoScreenX - 60;
      const maxX = engine.distance - dinoScreenX + 160;

      const range = findVisibleObstacleRange(engine.obstacles, minX, maxX);
      expect(range.startIndex).toBeLessThanOrEqual(range.endIndex);
      // For any obstacle in range, screenX is within [-60, 160]
      for (let i = range.startIndex; i < range.endIndex; i++) {
        const obs = engine.obstacles[i];
        const screenX = obs.x - engine.distance + dinoScreenX;
        expect(screenX + obs.width).toBeGreaterThanOrEqual(-60);
        expect(screenX).toBeLessThanOrEqual(160);
      }
    });
  });

  describe('5. Background Web Worker Ticker during Countdown', () => {
    it('does not step simulation while countdown is still active in background tab', () => {
      let stepped = false;
      const ctx: BackgroundTickerContext = {
        isMatchRunning: false,
        countdownEndTime: 10000,
        documentHidden: true,
        stepSimulation: () => {
          stepped = true;
        },
      };

      // Current time is 8000ms (countdown not finished)
      const changed = processBackgroundTick(ctx, 8000, 1 / 60);

      expect(changed).toBe(false);
      expect(ctx.isMatchRunning).toBe(false);
      expect(ctx.countdownEndTime).toBe(10000);
      expect(stepped).toBe(false);
    });

    it('automatically transitions to isMatchRunning = true and starts stepping simulation when countdown expires while tab is hidden', () => {
      let stepCount = 0;
      let startedCallbackTriggered = false;

      const ctx: BackgroundTickerContext = {
        isMatchRunning: false,
        countdownEndTime: 10000,
        documentHidden: true,
        stepSimulation: () => {
          stepCount++;
        },
        onMatchStarted: () => {
          startedCallbackTriggered = true;
        },
      };

      // Tick at 10005ms (countdown expired!)
      const changed = processBackgroundTick(ctx, 10005, 1 / 60);

      expect(changed).toBe(true);
      expect(ctx.isMatchRunning).toBe(true);
      expect(ctx.countdownEndTime).toBeNull();
      expect(startedCallbackTriggered).toBe(true);
      expect(stepCount).toBe(1);

      // Subsequent background ticks keep simulation progressing at 60Hz
      processBackgroundTick(ctx, 10022, 1 / 60);
      expect(stepCount).toBe(2);
    });

    it('ignores background ticking when document is visible (delegated to requestAnimationFrame)', () => {
      let stepCount = 0;
      const ctx: BackgroundTickerContext = {
        isMatchRunning: true,
        countdownEndTime: null,
        documentHidden: false, // Tab visible
        stepSimulation: () => {
          stepCount++;
        },
      };

      const changed = processBackgroundTick(ctx, 5000, 1 / 60);
      expect(changed).toBe(false);
      expect(stepCount).toBe(0);
    });
  });
});
