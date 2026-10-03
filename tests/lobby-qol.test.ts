import { describe, it, expect, vi } from 'vitest';
import {
  canJoinRoom,
  formatCleanRoomUrl,
  getHostLobbyButtonsState,
  planDisconnectHandling,
  formatP2PErrorMessage,
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

  it('formats p2p connection errors into clean Spanish without raw English errors', () => {
    // 1. Peer unavailable (e.g. host closed or non-existent room)
    expect(formatP2PErrorMessage({ type: 'peer-unavailable' })).toContain(
      'No se pudo conectar a la sala'
    );
    expect(
      formatP2PErrorMessage(new Error('Could not connect to peer dino1v1-8JRM'))
    ).toContain('No se pudo conectar a la sala');
    expect(formatP2PErrorMessage('Could not connect to peer dino1v1-8JRM')).toContain(
      'No se pudo conectar a la sala'
    );

    // 2. Room ID conflict
    expect(formatP2PErrorMessage({ type: 'unavailable-id' })).toContain(
      'ya está en uso'
    );

    // 3. Network or server error
    expect(formatP2PErrorMessage({ type: 'network' })).toContain(
      'Error de conexión con el servidor'
    );
    expect(
      formatP2PErrorMessage(new Error('Lost connection to server'))
    ).toContain('Error de conexión con el servidor');

    // 4. Timeout
    expect(
      formatP2PErrorMessage(new Error('Tiempo de espera agotado'))
    ).toContain('Tiempo de espera agotado');

    // 5. Fallback & null safety
    expect(formatP2PErrorMessage(null)).toBe('Error de conexión');
    expect(formatP2PErrorMessage(undefined)).toBe('Error de conexión');
    expect(formatP2PErrorMessage(new Error('Otro error específico'))).toBe(
      'Otro error específico'
    );
  });

  it('keeps host peer alive when rival disconnects so rivals can reconnect to the same room', () => {
    const onDisconnected = vi.fn();
    const p2p = new P2PManager(
      { name: 'HostPlayer', color: '#fff', skinId: 'classic' },
      {
        onConnected: vi.fn(),
        onDisconnected,
        onStartGame: vi.fn(),
        onRemoteState: vi.fn(),
        onRemoteDied: vi.fn(),
        onRematchRequested: vi.fn(),
        onPingUpdated: vi.fn(),
        onError: vi.fn(),
      }
    );

    // Setup host state with mocked peer and connection
    p2p.isHost = true;
    p2p.roomId = '8JRM';

    const mockPeerDestroy = vi.fn();
    const mockPeer = {
      destroyed: false,
      destroy: mockPeerDestroy,
      reconnect: vi.fn(),
    };
    (p2p as any).peer = mockPeer;

    const eventListeners: Record<string, Function> = {};
    const mockConnection = {
      open: true,
      on: vi.fn((event: string, cb: Function) => {
        eventListeners[event] = cb;
      }),
      close: vi.fn(),
      send: vi.fn(),
    };

    // Setup connection
    (p2p as any).setupConnection(mockConnection);
    expect(p2p.hasActivePeer).toBe(true);
    expect(p2p.isConnected).toBe(true);

    // Simulate rival closing tab/disconnecting
    eventListeners['close']();

    // 1. Host should be notified of rival disconnection
    expect(onDisconnected).toHaveBeenCalledTimes(1);

    // 2. CRITICAL: Host peer must NOT be destroyed!
    expect(mockPeerDestroy).not.toHaveBeenCalled();
    expect(p2p.hasActivePeer).toBe(true);
    expect(p2p.roomId).toBe('8JRM');
    expect(p2p.isHost).toBe(true);

    // 3. But when host explicitly calls cleanup (leaving room to menu), peer IS destroyed
    p2p.cleanup();
    expect(mockPeerDestroy).toHaveBeenCalledTimes(1);
    expect(p2p.hasActivePeer).toBe(false);
  });

  it('cleans up guest peer when guest disconnects from room', () => {
    const onDisconnected = vi.fn();
    const p2p = new P2PManager(
      { name: 'GuestPlayer', color: '#fff', skinId: 'classic' },
      {
        onConnected: vi.fn(),
        onDisconnected,
        onStartGame: vi.fn(),
        onRemoteState: vi.fn(),
        onRemoteDied: vi.fn(),
        onRematchRequested: vi.fn(),
        onPingUpdated: vi.fn(),
        onError: vi.fn(),
      }
    );

    p2p.isHost = false;
    p2p.roomId = '8JRM';

    const mockPeerDestroy = vi.fn();
    const mockPeer = {
      destroyed: false,
      destroy: mockPeerDestroy,
      reconnect: vi.fn(),
    };
    (p2p as any).peer = mockPeer;

    const eventListeners: Record<string, Function> = {};
    const mockConnection = {
      open: true,
      on: vi.fn((event: string, cb: Function) => {
        eventListeners[event] = cb;
      }),
      close: vi.fn(),
      send: vi.fn(),
    };

    (p2p as any).setupConnection(mockConnection);
    expect(p2p.hasActivePeer).toBe(true);

    // Simulate connection close on guest
    eventListeners['close']();

    // Guest cleans up its own peer on disconnect
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    expect(mockPeerDestroy).toHaveBeenCalledTimes(1);
    expect(p2p.hasActivePeer).toBe(false);
  });
});
