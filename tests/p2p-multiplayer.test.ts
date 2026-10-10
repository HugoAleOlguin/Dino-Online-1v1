import { describe, it, expect, vi } from 'vitest';
import { P2PManager, PlayerProfile, NetMessage } from '../src/net/p2p';
import { MAX_PLAYERS } from '../src/core/lobby-helpers';

describe('P2PManager Multi-Player (Up to 4 Players) & Room Full Protection', () => {
  const profileHost: PlayerProfile = { name: 'Host', color: '#ff0000', skinId: 'classic' };

  it('rejects connection when room is already full with 4 players (Host + 3 guests)', () => {
    const events = {
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onStartGame: vi.fn(),
      onRemoteState: vi.fn(),
      onRemoteDied: vi.fn(),
      onRematchRequested: vi.fn(),
      onPingUpdated: vi.fn(),
      onError: vi.fn(),
    };

    const manager = new P2PManager(profileHost, events);
    manager.isHost = true;

    // Simulate 3 connected guests (Total 4 players in room)
    const mockConn1 = { peer: 'p2', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };
    const mockConn2 = { peer: 'p3', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };
    const mockConn3 = { peer: 'p4', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };

    (manager as any).handleIncomingConnection(mockConn1);
    (manager as any).handleIncomingConnection(mockConn2);
    (manager as any).handleIncomingConnection(mockConn3);

    expect(manager.connectedPeersCount).toBe(3);

    // 5th player attempts to join
    const mockConn5 = { peer: 'p5', open: false, send: vi.fn(), close: vi.fn(), on: vi.fn() };
    (manager as any).handleIncomingConnection(mockConn5);

    // mockConn5 should have registered an open handler that sends ROOM_FULL and closes
    expect(mockConn5.on).toHaveBeenCalledWith('open', expect.any(Function));
    const openCallback = mockConn5.on.mock.calls.find((call: any[]) => call[0] === 'open')[1];
    openCallback();

    expect(mockConn5.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ROOM_FULL',
        reason: expect.stringContaining('La sala está llena'),
      })
    );
  });

  it('handles ROOM_FULL message on client by invoking onError with the descriptive message', () => {
    const events = {
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onStartGame: vi.fn(),
      onRemoteState: vi.fn(),
      onRemoteDied: vi.fn(),
      onRematchRequested: vi.fn(),
      onPingUpdated: vi.fn(),
      onError: vi.fn(),
      onRoomFull: vi.fn(),
    };

    const manager = new P2PManager(profileHost, events);
    const msg: NetMessage = {
      type: 'ROOM_FULL',
      reason: 'La sala está llena. Ya se ha alcanzado el límite máximo de 4 jugadores.',
    };

    (manager as any).handleMessage(msg);

    expect(events.onError).toHaveBeenCalledWith(
      expect.stringContaining('La sala está llena')
    );
  });
});
