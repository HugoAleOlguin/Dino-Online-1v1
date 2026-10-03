import { describe, it, expect, vi } from 'vitest';
import {
  canJoinRoom,
  formatCleanRoomUrl,
  getHostLobbyButtonsState,
  planDisconnectHandling,
} from '../src/core/lobby-helpers';
import { P2PManager } from '../src/net/p2p';

describe('Lobby QoL Helpers', () => {
  it('prevents self-joining the same room if the user is already hosting it', () => {
    expect(canJoinRoom('ABCD', 'ABCD')).toBe(false);
    expect(canJoinRoom('ABCD', 'WXYZ')).toBe(true);
    expect(canJoinRoom('ABCD', null)).toBe(true);
    expect(canJoinRoom('abcd', 'ABCD')).toBe(false); // Case-insensitive
    expect(canJoinRoom('  ABCD  ', 'abcd')).toBe(false); // Whitespace trimming
    expect(canJoinRoom('', 'ABCD')).toBe(false); // Empty code
    expect(canJoinRoom('   ', 'ABCD')).toBe(false); // Whitespace only
    expect(canJoinRoom('ABCD', 'ABCD', true)).toBe(false); // Host tab
  });

  it('formats clean room url properly', () => {
    const url = formatCleanRoomUrl('https://dino-1v1.vercel.app', '/', 'ABCD');
    expect(url).toBe('https://dino-1v1.vercel.app/?room=ABCD');

    const cleanDisplay = formatCleanRoomUrl('dino-1v1.vercel.app', '', 'ABCD');
    expect(cleanDisplay).toBe('dino-1v1.vercel.app/?room=ABCD');
  });

  it('triggers onKicked callback when KICKED message is received', () => {
    const onKicked = vi.fn();
    const p2p = new P2PManager(
      { name: 'Player', color: '#fff', skinId: 'classic' },
      {
        onConnected: vi.fn(),
        onDisconnected: vi.fn(),
        onStartGame: vi.fn(),
        onRemoteState: vi.fn(),
        onRemoteDied: vi.fn(),
        onRematchRequested: vi.fn(),
        onPingUpdated: vi.fn(),
        onError: vi.fn(),
        onKicked,
      }
    );

    // Call private handleMessage directly
    (p2p as any).handleMessage({ type: 'KICKED', reason: 'Saliste de la sala' });
    expect(onKicked).toHaveBeenCalledWith('Saliste de la sala');
  });

  it('triggers onCancelRematch callback when CANCEL_REMATCH message is received', () => {
    const onCancelRematch = vi.fn();
    const p2p = new P2PManager(
      { name: 'Player', color: '#fff', skinId: 'classic' },
      {
        onConnected: vi.fn(),
        onDisconnected: vi.fn(),
        onStartGame: vi.fn(),
        onRemoteState: vi.fn(),
        onRemoteDied: vi.fn(),
        onRematchRequested: vi.fn(),
        onPingUpdated: vi.fn(),
        onError: vi.fn(),
        onCancelRematch,
      }
    );

    (p2p as any).handleMessage({ type: 'CANCEL_REMATCH' });
    expect(onCancelRematch).toHaveBeenCalled();
  });

  it('hides host start button in lobby when returning from an active game, only showing return to game', () => {
    // 1. Initial room creation, no rival yet
    expect(getHostLobbyButtonsState(false, false)).toEqual({
      showStartBtn: false,
      showReturnGameBtn: false,
    });

    // 2. Rival connects for the first time -> host can start game
    expect(getHostLobbyButtonsState(true, false)).toEqual({
      showStartBtn: true,
      showReturnGameBtn: false,
    });

    // 3. Returning to lobby from an active/played match -> start button hidden, only return to game
    expect(getHostLobbyButtonsState(true, true)).toEqual({
      showStartBtn: false,
      showReturnGameBtn: true,
    });
  });

  it('allows local player to continue running when peer disconnects mid-match, then prompts return to lobby', () => {
    // 1. Mid-match while local is still alive
    const midMatch = planDisconnectHandling(true, false);
    expect(midMatch.shouldContinueRunning).toBe(true);
    expect(midMatch.showReturnToLobbyBtn).toBe(true);
    expect(midMatch.canRematch).toBe(false);
    expect(midMatch.noticeStatus).toContain('abandonó');

    // 2. Game already finished when disconnect happens
    const afterMatch = planDisconnectHandling(false, true);
    expect(afterMatch.shouldContinueRunning).toBe(false);
    expect(afterMatch.showReturnToLobbyBtn).toBe(true);
    expect(afterMatch.canRematch).toBe(false);
  });
});
