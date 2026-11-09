import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  P2PManager,
  PlayerProfile,
  NetMessage,
  MAX_BUFFERED_AMOUNT,
  applyEWMA,
  calculateClientCountdownDeadline,
} from '../src/net/p2p';

describe('WebRTC Robust Networking & Synchronization Suite (Ticket 2)', () => {
  const hostProfile: PlayerProfile = { name: 'HostDino', color: '#ff0000', skinId: 'classic' };
  const guestProfile: PlayerProfile = { name: 'GuestDino', color: '#00ff00', skinId: 'classic' };

  let events: any;

  beforeEach(() => {
    events = {
      onConnected: vi.fn(),
      onDisconnected: vi.fn(),
      onStartGame: vi.fn(),
      onRemoteState: vi.fn(),
      onRemoteDied: vi.fn(),
      onRematchRequested: vi.fn(),
      onPingUpdated: vi.fn(),
      onError: vi.fn(),
    };
  });

  // =========================================================================
  // 1. Numeración Incremental de Secuencia (seq) y Descarte de Fuera de Orden
  // =========================================================================
  describe('Packet Sequencing & Out-of-Order Packet Drop', () => {
    it('safeSendState increments sequence number monotonically starting from 1', () => {
      const manager = new P2PManager(guestProfile, events);
      const mockConn = {
        open: true,
        dataChannel: { bufferedAmount: 0 },
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };
      (manager as any).connection = mockConn;

      manager.safeSendState({
        y: 10,
        vy: 2,
        isDucking: false,
        isGrounded: true,
        distance: 100,
        score: 50,
      });

      expect(mockConn.send).toHaveBeenCalledTimes(1);
      const firstPacket = mockConn.send.mock.calls[0][0];
      expect(firstPacket.type).toBe('STATE');
      expect(firstPacket.seq).toBe(1);

      manager.safeSendState({
        y: 12,
        vy: 1,
        isDucking: false,
        isGrounded: true,
        distance: 105,
        score: 52,
      });

      const secondPacket = mockConn.send.mock.calls[1][0];
      expect(secondPacket.seq).toBe(2);
    });

    it('accepts packets arriving strictly in order (seq: 1, then seq: 2)', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const p1: NetMessage = {
        type: 'STATE',
        peerId: 'guest-1',
        y: 10,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 50,
        score: 20,
        t: 1000,
        seq: 1,
      };

      const p2: NetMessage = {
        type: 'STATE',
        peerId: 'guest-1',
        y: 15,
        vy: 1,
        isDucking: false,
        isGrounded: false,
        distance: 60,
        score: 25,
        t: 1033,
        seq: 2,
      };

      (manager as any).handleMessage(p1);
      expect(events.onRemoteState).toHaveBeenCalledTimes(1);
      expect(events.onRemoteState).toHaveBeenLastCalledWith(
        expect.objectContaining({ y: 10, seq: 1 })
      );

      (manager as any).handleMessage(p2);
      expect(events.onRemoteState).toHaveBeenCalledTimes(2);
      expect(events.onRemoteState).toHaveBeenLastCalledWith(
        expect.objectContaining({ y: 15, seq: 2 })
      );
    });

    it('drops out-of-order packets immediately (seq <= lastSeq) to prevent rubberbanding', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const p1: NetMessage = {
        type: 'STATE',
        peerId: 'guest-1',
        y: 10,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 50,
        score: 20,
        t: 1000,
        seq: 1,
      };

      const p3: NetMessage = {
        type: 'STATE',
        peerId: 'guest-1',
        y: 30,
        vy: 3,
        isDucking: false,
        isGrounded: false,
        distance: 80,
        score: 40,
        t: 1066,
        seq: 3,
      };

      const p2Delayed: NetMessage = {
        type: 'STATE',
        peerId: 'guest-1',
        y: 20,
        vy: 2,
        isDucking: false,
        isGrounded: false,
        distance: 65,
        score: 30,
        t: 1033,
        seq: 2, // Out-of-order! Arriving after seq 3
      };

      const p3Duplicate: NetMessage = {
        type: 'STATE',
        peerId: 'guest-1',
        y: 30,
        vy: 3,
        isDucking: false,
        isGrounded: false,
        distance: 80,
        score: 40,
        t: 1066,
        seq: 3, // Duplicate!
      };

      // 1. Receive seq 1
      (manager as any).handleMessage(p1);
      expect(events.onRemoteState).toHaveBeenCalledTimes(1);

      // 2. Receive seq 3 (jumped ahead)
      (manager as any).handleMessage(p3);
      expect(events.onRemoteState).toHaveBeenCalledTimes(2);
      expect(events.onRemoteState).toHaveBeenLastCalledWith(
        expect.objectContaining({ y: 30, seq: 3 })
      );

      // 3. Receive delayed seq 2 (must be dropped immediately!)
      (manager as any).handleMessage(p2Delayed);
      expect(events.onRemoteState).toHaveBeenCalledTimes(2); // Still 2! Not called for p2Delayed

      // 4. Receive duplicate seq 3 (must be dropped)
      (manager as any).handleMessage(p3Duplicate);
      expect(events.onRemoteState).toHaveBeenCalledTimes(2); // Still 2!
    });

    it('Host does not relay discarded out-of-order packets to other peers', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const mockConn1 = { peer: 'guest-1', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };
      const mockConn2 = { peer: 'guest-2', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };
      (manager as any).handleIncomingConnection(mockConn1);
      (manager as any).handleIncomingConnection(mockConn2);

      // guest-1 sends seq 5
      (manager as any).handleMessage(
        {
          type: 'STATE',
          y: 20,
          vy: 0,
          isDucking: false,
          isGrounded: true,
          distance: 50,
          score: 10,
          t: 1000,
          seq: 5,
        },
        mockConn1
      );

      expect(mockConn2.send).toHaveBeenCalledTimes(1);
      expect(mockConn2.send).toHaveBeenCalledWith(
        expect.objectContaining({ seq: 5, peerId: 'guest-1' })
      );

      // guest-1 sends delayed seq 4 (out-of-order)
      (manager as any).handleMessage(
        {
          type: 'STATE',
          y: 18,
          vy: 0,
          isDucking: false,
          isGrounded: true,
          distance: 45,
          score: 9,
          t: 966,
          seq: 4,
        },
        mockConn1
      );

      // mockConn2 must NOT receive seq 4!
      expect(mockConn2.send).toHaveBeenCalledTimes(1);
    });

    it('tracks sequences independently per peer in multi-guest lobby', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const statePeerA: NetMessage = {
        type: 'STATE',
        peerId: 'peer-A',
        y: 10,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 20,
        score: 5,
        t: 1000,
        seq: 10,
      };

      const statePeerB: NetMessage = {
        type: 'STATE',
        peerId: 'peer-B',
        y: 50,
        vy: 2,
        isDucking: true,
        isGrounded: true,
        distance: 15,
        score: 3,
        t: 1000,
        seq: 2, // Low seq number, but for peer-B it is valid!
      };

      (manager as any).handleMessage(statePeerA);
      expect(events.onRemoteState).toHaveBeenCalledWith(
        expect.objectContaining({ peerId: 'peer-A', seq: 10 })
      );

      // Peer B's packet with seq=2 must NOT be dropped just because Peer A reached seq=10
      (manager as any).handleMessage(statePeerB);
      expect(events.onRemoteState).toHaveBeenCalledWith(
        expect.objectContaining({ peerId: 'peer-B', seq: 2 })
      );
    });
  });

  // =========================================================================
  // 2. Sincronización de Cuenta Regresiva Relativa y Latencia RTT/2
  // =========================================================================
  describe('Relative Countdown Synchronization & One-Way Latency Compensation', () => {
    it('calculateClientCountdownDeadline discounts one-way latency (RTT/2) from countdown duration', () => {
      const countdownDurationMs = 5200;
      const oneWayLatencyMs = 60; // 60ms one-way latency (120ms RTT)
      const nowMs = 10000;

      const deadline = calculateClientCountdownDeadline(countdownDurationMs, oneWayLatencyMs, nowMs);
      // Adjusted duration should be 5200 - 60 = 5140ms
      expect(deadline).toBe(10000 + 5140);
    });

    it('calculateClientCountdownDeadline clamps duration to 0 if latency exceeds duration', () => {
      const countdownDurationMs = 1000;
      const extremeLagMs = 1500;
      const nowMs = 5000;

      const deadline = calculateClientCountdownDeadline(countdownDurationMs, extremeLagMs, nowMs);
      expect(deadline).toBe(5000); // 5000 + 0
    });

    it('manager.calculateCountdownDeadline uses getEstimatedOneWayLatency()', () => {
      const manager = new P2PManager(guestProfile, events);
      vi.spyOn(manager, 'getEstimatedOneWayLatency').mockReturnValue(45);

      const deadline = manager.calculateCountdownDeadline(5000, 20000);
      expect(deadline).toBe(20000 + (5000 - 45));
    });

    it('onStartGame event handler passes countdownDurationMs when received from Host', () => {
      const manager = new P2PManager(guestProfile, events);

      const startMsg: NetMessage = {
        type: 'START_GAME',
        seed: 4242,
        startTimestamp: 1234567,
        countdownDurationMs: 5200,
      };

      (manager as any).handleMessage(startMsg);

      expect(events.onStartGame).toHaveBeenCalledWith(4242, 1234567, 5200);
    });
  });

  // =========================================================================
  // 3. Backpressure Control con safeSendState()
  // =========================================================================
  describe('Backpressure Control (safeSendState & MAX_BUFFERED_AMOUNT)', () => {
    it('defines MAX_BUFFERED_AMOUNT as 64KB (65536 bytes)', () => {
      expect(MAX_BUFFERED_AMOUNT).toBe(64 * 1024);
      expect(MAX_BUFFERED_AMOUNT).toBe(65536);
    });

    it('discards ephemeral STATE packet when bufferedAmount > 64KB on Guest', () => {
      const manager = new P2PManager(guestProfile, events);
      const mockConn = {
        open: true,
        dataChannel: { bufferedAmount: 65537 }, // Exceeds 64KB
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };
      (manager as any).connection = mockConn;

      const sent = manager.safeSendState({
        y: 10,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 100,
        score: 50,
      });

      expect(sent).toBe(false);
      expect(mockConn.send).not.toHaveBeenCalled();
    });

    it('sends STATE packet when bufferedAmount <= 64KB on Guest', () => {
      const manager = new P2PManager(guestProfile, events);
      const mockConn = {
        open: true,
        dataChannel: { bufferedAmount: 32000 }, // Safe buffer
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };
      (manager as any).connection = mockConn;

      const sent = manager.safeSendState({
        y: 10,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 100,
        score: 50,
      });

      expect(sent).toBe(true);
      expect(mockConn.send).toHaveBeenCalledTimes(1);
    });

    it('Host sends to peers with available buffer capacity and drops only for backpressured peers', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const healthyPeerConn = {
        peer: 'healthy-peer',
        open: true,
        dataChannel: { bufferedAmount: 1024 },
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };

      const congestedPeerConn = {
        peer: 'congested-peer',
        open: true,
        dataChannel: { bufferedAmount: 120000 }, // Heavily congested buffer
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };

      (manager as any).handleIncomingConnection(healthyPeerConn);
      (manager as any).handleIncomingConnection(congestedPeerConn);

      const sent = manager.safeSendState({
        y: 0,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 200,
        score: 100,
      });

      expect(sent).toBe(true);
      expect(healthyPeerConn.send).toHaveBeenCalledTimes(1);
      expect(congestedPeerConn.send).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Cálculo Bidireccional de Ping/RTT con Filtro EWMA (alfa = 0.2)
  // =========================================================================
  describe('Bidirectional Ping / RTT with EWMA Filter (alpha = 0.2)', () => {
    it('applyEWMA initializes with sample on first call and computes alpha * sample + (1 - alpha) * prev', () => {
      // First sample
      const first = applyEWMA(100, undefined, 0.2);
      expect(first).toBe(100);

      // Second sample: 0.2 * 50 + 0.8 * 100 = 10 + 80 = 90
      const second = applyEWMA(50, first, 0.2);
      expect(second).toBe(90);

      // Third sample: 0.2 * 150 + 0.8 * 90 = 30 + 72 = 102
      const third = applyEWMA(150, second, 0.2);
      expect(third).toBe(102);
    });

    it('Host immediately responds with PONG to incoming PING from Guest', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const mockGuestConn = {
        peer: 'guest-1',
        open: true,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };

      (manager as any).handleMessage({ type: 'PING', t: 12345 }, mockGuestConn);

      expect(mockGuestConn.send).toHaveBeenCalledWith({
        type: 'PONG',
        t: 12345,
      });
    });

    it('Guest immediately responds with PONG to incoming PING from Host', () => {
      const manager = new P2PManager(guestProfile, events);
      manager.isHost = false;

      const mockHostConn = {
        peer: 'host-peer',
        open: true,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };
      (manager as any).connection = mockHostConn;

      (manager as any).handleMessage({ type: 'PING', t: 67890 });

      expect(mockHostConn.send).toHaveBeenCalledWith({
        type: 'PONG',
        t: 67890,
      });
    });

    it('Guest applies EWMA smoothing to ping and updates onPingUpdated on receiving PONG', () => {
      const manager = new P2PManager(guestProfile, events);
      vi.spyOn(performance, 'now').mockReturnValue(1100);

      // Sample 1: t sent = 1000, now = 1100 -> RTT = 100ms -> Ping = 50ms
      (manager as any).handleMessage({ type: 'PONG', t: 1000 });
      expect(events.onPingUpdated).toHaveBeenCalledWith(50);
      expect(manager.getEstimatedOneWayLatency()).toBe(50);

      // Sample 2: RTT spike to 200ms (t sent = 1000, now = 1200)
      vi.spyOn(performance, 'now').mockReturnValue(1200);
      // Smoothed RTT = 0.2 * 200 + 0.8 * 100 = 40 + 80 = 120ms -> Ping = 60ms
      (manager as any).handleMessage({ type: 'PONG', t: 1000 });
      expect(events.onPingUpdated).toHaveBeenCalledWith(60);
      expect(manager.getEstimatedOneWayLatency()).toBe(60);
    });

    it('Host also computes smoothed RTT / Ping for guests on receiving PONG (Bidirectional)', () => {
      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      const mockGuestConn = {
        peer: 'guest-1',
        open: true,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      };

      vi.spyOn(performance, 'now').mockReturnValue(5080);

      // Host receives PONG from guest-1: t = 5000, now = 5080 -> RTT = 80ms -> Ping = 40ms
      (manager as any).handleMessage({ type: 'PONG', t: 5000 }, mockGuestConn);

      expect(events.onPingUpdated).toHaveBeenCalledWith(40);
      expect(manager.getEstimatedOneWayLatency()).toBe(40);
    });
  });
});
