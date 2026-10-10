import { describe, it, expect } from 'vitest';
import {
  isRoomFull,
  formatP2PErrorMessage,
  MAX_PLAYERS,
} from '../src/core/lobby-helpers';

describe('Lobby Room Full & Max Players Validation (Up to 4 Players)', () => {
  it('defines maximum players constant as 4', () => {
    expect(MAX_PLAYERS).toBe(4);
  });

  it('correctly detects when a room has reached capacity', () => {
    expect(isRoomFull(1)).toBe(false);
    expect(isRoomFull(2)).toBe(false);
    expect(isRoomFull(3)).toBe(false);
    expect(isRoomFull(4)).toBe(true);
    expect(isRoomFull(5)).toBe(true);
  });

  it('formats room full error into exact friendly message preventing unwanted joins', () => {
    const errorWithMsg = { message: 'La sala está llena' };
    const errorWithType = { type: 'room-full', message: 'Room has reached max capacity' };
    const rawEnglish = 'room is full, maximum players reached';

    const formatted1 = formatP2PErrorMessage(errorWithMsg);
    const formatted2 = formatP2PErrorMessage(errorWithType);
    const formatted3 = formatP2PErrorMessage(rawEnglish);

    expect(formatted1).toContain('La sala está llena');
    expect(formatted1).toContain('máximo de 4 jugadores');

    expect(formatted2).toContain('La sala está llena');
    expect(formatted2).toContain('máximo de 4 jugadores');

    expect(formatted3).toContain('La sala está llena');
    expect(formatted3).toContain('máximo de 4 jugadores');
  });
});
