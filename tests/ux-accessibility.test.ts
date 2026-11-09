import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { extractRoomCode } from '../src/core/lobby-helpers';
import {
  getPingClass,
  getColorSwatchLabel,
  createColorSwatchElement,
  LOBBY_COLOR_OPTIONS,
} from '../src/render/ui-helpers';

describe('Ticket 4: Mobile Ergonomics, Visual Feedback & Accessibility', () => {
  describe('Lobby Status Boxes & Viewport Meta in DOM', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    it('verifies #host-status-box does NOT contain the "hidden" class in index.html', () => {
      const hostMatch = htmlContent.match(/id=["']host-status-box["'][^>]*class=["']([^"']*)["']/i) ||
                        htmlContent.match(/class=["']([^"']*)["'][^>]*id=["']host-status-box["']/i);
      expect(hostMatch).not.toBeNull();
      const classes = hostMatch ? hostMatch[1].split(/\s+/) : [];
      expect(classes).not.toContain('hidden');
      expect(classes).toContain('room-status-banner');
    });

    it('verifies #guest-status-box does NOT contain the "hidden" class in index.html', () => {
      const guestMatch = htmlContent.match(/id=["']guest-status-box["'][^>]*class=["']([^"']*)["']/i) ||
                         htmlContent.match(/class=["']([^"']*)["'][^>]*id=["']guest-status-box["']/i);
      expect(guestMatch).not.toBeNull();
      const classes = guestMatch ? guestMatch[1].split(/\s+/) : [];
      expect(classes).not.toContain('hidden');
      expect(classes).toContain('room-status-banner');
    });

    it('verifies meta viewport contains viewport-fit=cover for safe-area insets', () => {
      const viewportMatch = htmlContent.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i);
      expect(viewportMatch).not.toBeNull();
      expect(viewportMatch![1]).toContain('viewport-fit=cover');
    });
  });

  describe('Room Code Sanitization & Extraction (extractRoomCode)', () => {
    it('extracts 4-character code when a full URL is pasted', () => {
      expect(extractRoomCode('https://dino-1v1.vercel.app/?room=ABCD')).toBe('ABCD');
      expect(extractRoomCode('http://localhost:5173/?room=xy99')).toBe('XY99');
      expect(extractRoomCode('https://dino.game/play?room=K7M2&spectate=true')).toBe('K7M2');
    });

    it('extracts code when query string prefix is pasted (?room=... or room=...)', () => {
      expect(extractRoomCode('?room=ABCD')).toBe('ABCD');
      expect(extractRoomCode('room=ABCD')).toBe('ABCD');
      expect(extractRoomCode('?room=wxyz')).toBe('WXYZ');
    });

    it('handles direct 4-character code inputs and normalizes to uppercase', () => {
      expect(extractRoomCode('abcd')).toBe('ABCD');
      expect(extractRoomCode('  xy89  ')).toBe('XY89');
      expect(extractRoomCode('AB-12')).toBe('AB12');
    });

    it('handles empty or invalid inputs gracefully', () => {
      expect(extractRoomCode('')).toBe('');
      expect(extractRoomCode('   ')).toBe('');
      expect(extractRoomCode('https://dino-1v1.vercel.app/')).toBe('');
    });
  });

  describe('Accessible Color Swatches Generation', () => {
    it('provides descriptive Spanish labels for all lobby colors', () => {
      expect(LOBBY_COLOR_OPTIONS.length).toBeGreaterThanOrEqual(6);
      expect(getColorSwatchLabel('#ffffff')).toMatch(/blanco/i);
      expect(getColorSwatchLabel('#acacac')).toMatch(/gris/i);
      expect(getColorSwatchLabel('#f1c40f')).toMatch(/dorado|amarillo/i);
      expect(getColorSwatchLabel('#2ecc71')).toMatch(/verde/i);
      expect(getColorSwatchLabel('#e74c3c')).toMatch(/rojo/i);
      expect(getColorSwatchLabel('#e67e22')).toMatch(/ámbar|ambar|naranja/i);
    });

    it('creates button elements with type="button", aria-pressed, and aria-label', () => {
      // Mock minimal DOM if in pure Node environment
      if (typeof globalThis.document === 'undefined') {
        (globalThis as any).document = {
          createElement: (tag: string) => {
            const attrs = new Map<string, string>();
            const style: Record<string, string> = {};
            const listeners: Record<string, Function[]> = {};
            return {
              tagName: tag.toUpperCase(),
              type: '',
              className: '',
              style,
              setAttribute: (k: string, v: string) => attrs.set(k, v),
              getAttribute: (k: string) => attrs.get(k) ?? null,
              hasAttribute: (k: string) => attrs.has(k),
              addEventListener: (event: string, fn: Function) => {
                listeners[event] = listeners[event] || [];
                listeners[event].push(fn);
              },
            };
          },
        };
      }

      const activeSwatch = createColorSwatchElement('#ffffff', true);
      expect(activeSwatch.tagName.toLowerCase()).toBe('button');
      expect(activeSwatch.getAttribute('type')).toBe('button');
      expect(activeSwatch.getAttribute('aria-pressed')).toBe('true');
      expect(activeSwatch.getAttribute('aria-label')).toMatch(/blanco/i);
      expect(activeSwatch.className).toContain('active');

      const inactiveSwatch = createColorSwatchElement('#2ecc71', false);
      expect(inactiveSwatch.tagName.toLowerCase()).toBe('button');
      expect(inactiveSwatch.getAttribute('type')).toBe('button');
      expect(inactiveSwatch.getAttribute('aria-pressed')).toBe('false');
      expect(inactiveSwatch.getAttribute('aria-label')).toMatch(/verde/i);
      expect(inactiveSwatch.className).not.toContain('active');
    });
  });

  describe('Semantic Ping Latency Classes (getPingClass)', () => {
    it('classifies ping < 80ms as ping-good', () => {
      expect(getPingClass(0)).toBe('ping-good');
      expect(getPingClass(25)).toBe('ping-good');
      expect(getPingClass(79)).toBe('ping-good');
    });

    it('classifies ping >= 80ms and < 180ms as ping-fair', () => {
      expect(getPingClass(80)).toBe('ping-fair');
      expect(getPingClass(120)).toBe('ping-fair');
      expect(getPingClass(179)).toBe('ping-fair');
    });

    it('classifies ping >= 180ms as ping-poor', () => {
      expect(getPingClass(180)).toBe('ping-poor');
      expect(getPingClass(250)).toBe('ping-poor');
      expect(getPingClass(999)).toBe('ping-poor');
    });
  });
});
