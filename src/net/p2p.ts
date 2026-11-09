import { Peer, DataConnection } from 'peerjs';
import { formatP2PErrorMessage, MAX_PLAYERS } from '../core/lobby-helpers';

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
];

export const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64KB (65536 bytes)
export const EWMA_ALPHA = 0.2;

export function applyEWMA(
  sample: number,
  previous: number | undefined,
  alpha: number = EWMA_ALPHA
): number {
  if (previous === undefined) {
    return sample;
  }
  return alpha * sample + (1 - alpha) * previous;
}

export function calculateClientCountdownDeadline(
  countdownDurationMs: number,
  oneWayLatencyMs: number,
  nowMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now()
): number {
  const adjustedDuration = Math.max(0, countdownDurationMs - oneWayLatencyMs);
  return nowMs + adjustedDuration;
}

export interface StateMessagePayload {
  y: number;
  vy: number;
  isDucking: boolean;
  isGrounded: boolean;
  distance: number;
  score: number;
  t?: number;
  seq?: number;
  peerId?: string;
  type?: 'STATE';
}

export interface PlayerProfile {
  name: string;
  color: string;
  skinId: string;
}

export interface PlayerSlot {
  peerId: string;
  profile: PlayerProfile;
  isHost?: boolean;
}

export type NetMessage =
  | { type: 'HANDSHAKE'; profile: PlayerProfile }
  | {
      type: 'HANDSHAKE_ACK';
      profile: PlayerProfile;
      peers?: PlayerSlot[];
      matchInProgress?: boolean;
      seed?: number;
    }
  | { type: 'ROOM_FULL'; reason: string }
  | { type: 'PEER_JOINED'; peerId: string; profile: PlayerProfile }
  | { type: 'PEER_LEFT'; peerId: string }
  | { type: 'PROFILE_UPDATE'; profile: PlayerProfile; peerId?: string }
  | {
      type: 'START_GAME';
      seed: number;
      startTimestamp?: number;
      countdownDurationMs?: number;
    }
  | {
      type: 'STATE';
      peerId?: string;
      y: number;
      vy: number;
      isDucking: boolean;
      isGrounded: boolean;
      distance: number;
      score: number;
      t: number;
      seq?: number;
    }
  | { type: 'DIED'; peerId?: string; score: number; distance: number }
  | { type: 'REMATCH_REQUEST'; seed: number }
  | { type: 'REMATCH_READY'; seed?: number }
  | { type: 'CANCEL_REMATCH' }
  | { type: 'PLAYER_IN_LOBBY' }
  | { type: 'PLAYER_READY_IN_LOBBY' }
  | { type: 'KICKED'; reason?: string }
  | { type: 'PING'; t: number }
  | { type: 'PONG'; t: number };

export interface P2PEvents {
  onConnected: (
    remoteProfile: PlayerProfile,
    peerId?: string,
    isMatchInProgress?: boolean,
    seed?: number,
    existingPeers?: PlayerSlot[]
  ) => void;
  onDisconnected: (peerId?: string) => void;
  onProfileUpdated?: (profile: PlayerProfile, peerId?: string) => void;
  onStartGame: (seed: number, startTimestamp: number, countdownDurationMs?: number) => void;
  onRemoteState: (state: {
    peerId?: string;
    y: number;
    vy: number;
    isDucking: boolean;
    isGrounded: boolean;
    distance: number;
    score: number;
    seq?: number;
  }) => void;
  onRemoteDied: (finalScore: number, distance: number, peerId?: string) => void;
  onRematchRequested: (seed: number) => void;
  onRematchReady?: () => void;
  onCancelRematch?: () => void;
  onRemoteInLobby?: () => void;
  onRemoteReadyInLobby?: () => void;
  onKicked?: (reason?: string) => void;
  onPingUpdated: (pingMs: number) => void;
  onError: (error: string) => void;
  onPeerJoined?: (peerId: string, profile: PlayerProfile) => void;
  onPeerLeft?: (peerId: string) => void;
  onRoomFull?: (reason: string) => void;
}

export class P2PManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null; // For guest: connection to host
  private connections: Map<string, DataConnection> = new Map(); // For host: connections to all guests
  private peerProfiles: Map<string, PlayerProfile> = new Map();
  private events: P2PEvents;
  private localProfile: PlayerProfile;
  public isHost: boolean = false;
  public roomId: string | null = null;
  public isMatchInProgress: boolean = false;
  public currentSeed: number = 12345;
  private pingInterval: any = null;
  private localSeq: number = 0;
  private lastReceivedSeq: Map<string, number> = new Map();
  public currentPingMs: number = 0;
  public smoothedRtt: number = 0;
  private peerRtts: Map<string, number> = new Map();

  constructor(localProfile: PlayerProfile, events: P2PEvents) {
    this.localProfile = localProfile;
    this.events = events;
  }

  setLocalProfile(profile: PlayerProfile): void {
    this.localProfile = profile;
    this.send({ type: 'PROFILE_UPDATE', profile });
  }

  getEstimatedOneWayLatency(): number {
    return this.currentPingMs;
  }

  calculateCountdownDeadline(
    countdownDurationMs: number,
    now: number = typeof performance !== 'undefined' ? performance.now() : Date.now()
  ): number {
    return calculateClientCountdownDeadline(countdownDurationMs, this.getEstimatedOneWayLatency(), now);
  }

  safeSendState(statePayload: StateMessagePayload): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const seq = ++this.localSeq;
    const msg: NetMessage = {
      type: 'STATE',
      y: statePayload.y,
      vy: statePayload.vy,
      isDucking: statePayload.isDucking,
      isGrounded: statePayload.isGrounded,
      distance: statePayload.distance,
      score: statePayload.score,
      t: statePayload.t ?? now,
      seq,
      peerId: statePayload.peerId,
    };

    if (this.isHost) {
      if (this.connections.size === 0 && (!this.connection || !this.connection.open)) {
        return false;
      }
      let sentAny = false;
      for (const conn of this.connections.values()) {
        if (!conn.open) continue;
        const dc = (conn as any).dataChannel || conn;
        const buffered = dc.bufferedAmount ?? (conn as any).bufferedAmount ?? 0;
        if (buffered > MAX_BUFFERED_AMOUNT) {
          // Discard ephemeral packet to prevent bufferbloat
          continue;
        }
        try {
          conn.send(msg);
          sentAny = true;
        } catch {}
      }
      if (this.connection && this.connection.open) {
        const dc = (this.connection as any).dataChannel || this.connection;
        const buffered = dc.bufferedAmount ?? (this.connection as any).bufferedAmount ?? 0;
        if (buffered <= MAX_BUFFERED_AMOUNT) {
          try {
            this.connection.send(msg);
            sentAny = true;
          } catch {}
        }
      }
      return sentAny;
    } else {
      if (!this.connection || !this.connection.open) return false;
      const dc = (this.connection as any).dataChannel || this.connection;
      const buffered = dc.bufferedAmount ?? (this.connection as any).bufferedAmount ?? 0;
      if (buffered > MAX_BUFFERED_AMOUNT) {
        // Discard ephemeral packet due to bufferbloat backpressure
        return false;
      }
      try {
        this.connection.send(msg);
        return true;
      } catch {
        return false;
      }
    }
  }

  get isConnected(): boolean {
    if (this.isHost) {
      return this.connections.size > 0 || !!(this.connection && this.connection.open);
    }
    return !!(this.connection && this.connection.open);
  }

  get connectedPeersCount(): number {
    return this.isHost ? Math.max(this.connections.size, this.connection?.open ? 1 : 0) : (this.isConnected ? 1 : 0);
  }

  get totalRoomPlayersCount(): number {
    return 1 + this.connectedPeersCount;
  }

  get hasActivePeer(): boolean {
    return !!(this.peer && !this.peer.destroyed);
  }

  getPeersList(): PlayerSlot[] {
    return Array.from(this.peerProfiles.entries()).map(([peerId, profile]) => ({
      peerId,
      profile,
    }));
  }

  /**
   * Host creates a room with an easy-to-type 4-letter alphanumeric code.
   * Auto-retries if the code happens to collide with a stale ID on PeerJS cloud.
   */
  async createRoom(maxRetries: number = 3): Promise<string> {
    this.cleanup();
    this.isHost = true;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      const fullPeerId = `dino1v1-${code}`;
      this.roomId = code;

      try {
        await new Promise<string>((resolve, reject) => {
          this.peer = new Peer(fullPeerId, {
            config: {
              iceServers: DEFAULT_ICE_SERVERS,
            },
          });

          this.peer.on('open', () => {
            resolve(code);
          });

          this.peer.on('disconnected', () => {
            if (this.isHost && this.peer && !this.peer.destroyed) {
              try {
                this.peer.reconnect();
              } catch {}
            }
          });

          this.peer.on('error', (err: any) => {
            if (err?.type === 'unavailable-id' && attempt < maxRetries - 1) {
              try { this.peer?.destroy(); } catch {}
              this.peer = null;
              reject(err);
              return;
            }
            const friendlyMsg = formatP2PErrorMessage(err);
            this.events.onError(friendlyMsg);
            reject(err);
          });

          this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
          });
        });

        return code;
      } catch (err: any) {
        if (err?.type === 'unavailable-id' && attempt < maxRetries - 1) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('No se pudo crear la sala. Verifica la conexión.');
  }

  /**
   * Handles incoming connection on Host with strict MAX_PLAYERS = 4 enforcement.
   */
  public handleIncomingConnection(conn: DataConnection): void {
    // If room is already full (Host + 3 guests = 4 players max): reject!
    if (this.connections.size >= MAX_PLAYERS - 1) {
      const rejectFull = () => {
        try {
          conn.send({
            type: 'ROOM_FULL',
            reason: 'La sala está llena. Ya se ha alcanzado el límite máximo de 4 jugadores.',
          });
        } catch {}
        setTimeout(() => {
          try {
            conn.close();
          } catch {}
        }, 80);
      };

      if (conn.open) {
        rejectFull();
      } else {
        conn.on('open', rejectFull);
      }
      return;
    }

    const peerKey = conn.peer || `peer-${this.connections.size + 1}`;
    this.connections.set(peerKey, conn);
    this.setupConnection(conn);
  }

  /**
   * Guest joins an existing room by code with generous timeout and automatic retry.
   */
  async joinRoom(roomCode: string): Promise<void> {
    this.cleanup();
    this.isHost = false;
    this.roomId = roomCode.toUpperCase().trim();
    const fullPeerId = `dino1v1-${this.roomId}`;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let timeoutId: any = null;
      let connectRetryCount = 0;
      const maxConnectRetries = 3;

      const safeReject = (err: unknown) => {
        if (isSettled) return;
        isSettled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        const friendlyMsg = formatP2PErrorMessage(err);
        this.cleanup();
        this.events.onError(friendlyMsg);
        reject(new Error(friendlyMsg));
      };

      const safeResolve = () => {
        if (isSettled) return;
        isSettled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve();
      };

      // 25 second timeout to guarantee NAT traversal / ICE candidate exchange completes
      timeoutId = setTimeout(() => {
        safeReject(new Error('Tiempo de espera agotado al conectar a la sala.'));
      }, 25000);

      try {
        this.peer = new Peer({
          config: {
            iceServers: DEFAULT_ICE_SERVERS,
          },
        });
      } catch (err) {
        safeReject(err);
        return;
      }

      const attemptConnect = () => {
        if (!this.peer || this.peer.destroyed || isSettled) return;
        try {
          if (this.connection) {
            try { this.connection.close(); } catch {}
            this.connection = null;
          }
          // Note: Omitting { reliable: true } fixes connection hang on modern WebRTC
          const conn = this.peer.connect(fullPeerId);
          this.connection = conn;

          conn.on('error', (err: any) => {
            if (!isSettled) {
              if (err?.type === 'peer-unavailable' && connectRetryCount < maxConnectRetries) {
                connectRetryCount++;
                setTimeout(attemptConnect, 1200);
                return;
              }
              safeReject(err);
            }
          });

          this.setupConnection(conn, () => {
            safeResolve();
          });
        } catch (err) {
          safeReject(err);
        }
      };

      this.peer.on('open', () => {
        attemptConnect();
      });

      this.peer.on('error', (err: any) => {
        if (!isSettled) {
          if (err?.type === 'peer-unavailable' && connectRetryCount < maxConnectRetries) {
            connectRetryCount++;
            setTimeout(attemptConnect, 1200);
            return;
          }
          safeReject(err);
        } else {
          const friendlyMsg = formatP2PErrorMessage(err);
          this.events.onError(friendlyMsg);
        }
      });
    });
  }

  private setupConnection(conn: DataConnection, onOpen?: () => void): void {
    const peerKey = conn.peer || `peer-${this.connections.size + 1}`;
    if (this.isHost) {
      this.connections.set(peerKey, conn);
    } else {
      this.connection = conn;
    }

    const handleOpen = () => {
      // Only guest initiates the handshake so onConnected is not invoked repeatedly
      if (!this.isHost) {
        try {
          conn.send({ type: 'HANDSHAKE', profile: this.localProfile });
        } catch {}
      }
      if (!this.pingInterval) {
        this.startPing();
      }

      if (onOpen) {
        onOpen();
      }
    };

    if (conn.open) {
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (raw: any) => {
      const msg = raw as NetMessage;
      this.handleMessage(msg, conn);
    });

    conn.on('close', () => {
      this.handleConnectionClose(conn);
    });

    conn.on('error', (err) => {
      const friendlyMsg = formatP2PErrorMessage(err);
      this.events.onError(friendlyMsg);
    });
  }

  private handleConnectionClose(conn: DataConnection): void {
    const peerKey = conn.peer || Array.from(this.connections.keys())[0] || 'peer';
    if (this.isHost) {
      this.connections.delete(peerKey);
      this.peerProfiles.delete(peerKey);
      this.lastReceivedSeq.delete(peerKey);
      this.peerRtts.delete(peerKey);
      if (this.connections.size === 0 && this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      if (this.connection === conn) {
        this.connection = null;
      }

      // Notify other clients that this peer left
      this.broadcastToOthers(peerKey, { type: 'PEER_LEFT', peerId: peerKey });

      if (this.events.onPeerLeft) {
        this.events.onPeerLeft(peerKey);
      }
      this.events.onDisconnected(peerKey);
    } else {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      this.connection = null;
      this.events.onDisconnected();
      this.cleanup();
    }
  }

  public handleMessage(msg: NetMessage, fromConn?: DataConnection): void {
    const senderId = fromConn?.peer;

    switch (msg.type) {
      case 'ROOM_FULL':
        if (this.events.onRoomFull) {
          this.events.onRoomFull(msg.reason);
        }
        this.events.onError(msg.reason);
        this.cleanup();
        break;

      case 'HANDSHAKE':
        if (this.isHost && fromConn) {
          this.peerProfiles.set(fromConn.peer, msg.profile);

          // Build existing peers list for the new joiner
          const existingPeers: PlayerSlot[] = Array.from(this.peerProfiles.entries())
            .filter(([id]) => id !== fromConn.peer)
            .map(([id, profile]) => ({ peerId: id, profile }));

          // Send ACK with host profile, other peers, and match status
          fromConn.send({
            type: 'HANDSHAKE_ACK',
            profile: this.localProfile,
            peers: existingPeers,
            matchInProgress: this.isMatchInProgress,
            seed: this.currentSeed,
          });

          // Notify existing peers about the newcomer
          this.broadcastToOthers(fromConn.peer, {
            type: 'PEER_JOINED',
            peerId: fromConn.peer,
            profile: msg.profile,
          });

          if (this.events.onPeerJoined) {
            this.events.onPeerJoined(fromConn.peer, msg.profile);
          }
          this.events.onConnected(msg.profile, fromConn.peer);
        } else {
          this.send({ type: 'HANDSHAKE_ACK', profile: this.localProfile });
          this.events.onConnected(msg.profile, senderId);
        }
        break;

      case 'HANDSHAKE_ACK':
        if (msg.peers) {
          for (const slot of msg.peers) {
            this.peerProfiles.set(slot.peerId, slot.profile);
          }
        }
        this.events.onConnected(
          msg.profile,
          senderId,
          msg.matchInProgress,
          msg.seed,
          msg.peers
        );
        break;

      case 'PEER_JOINED':
        this.peerProfiles.set(msg.peerId, msg.profile);
        if (this.events.onPeerJoined) {
          this.events.onPeerJoined(msg.peerId, msg.profile);
        }
        break;

      case 'PEER_LEFT':
        this.peerProfiles.delete(msg.peerId);
        if (this.events.onPeerLeft) {
          this.events.onPeerLeft(msg.peerId);
        }
        break;

      case 'PROFILE_UPDATE':
        if (senderId) {
          msg.peerId = senderId;
          this.peerProfiles.set(senderId, msg.profile);
          if (this.isHost) {
            this.broadcastToOthers(senderId, msg);
          }
        }
        if (this.events.onProfileUpdated) {
          this.events.onProfileUpdated(msg.profile, msg.peerId || senderId);
        }
        break;

      case 'START_GAME':
        this.events.onStartGame(msg.seed, msg.startTimestamp ?? 0, msg.countdownDurationMs);
        break;

      case 'STATE': {
        const senderKey = senderId || msg.peerId || 'default';
        if (msg.seq !== undefined) {
          const lastSeq = this.lastReceivedSeq.get(senderKey);
          if (lastSeq !== undefined && msg.seq <= lastSeq) {
            // Out of order packet, discard immediately!
            return;
          }
          this.lastReceivedSeq.set(senderKey, msg.seq);
        }

        const statePayload = {
          peerId: msg.peerId || senderId,
          y: msg.y,
          vy: msg.vy,
          isDucking: msg.isDucking,
          isGrounded: msg.isGrounded,
          distance: msg.distance,
          score: msg.score,
          seq: msg.seq,
        };
        if (this.isHost && senderId) {
          msg.peerId = senderId;
          this.broadcastToOthers(senderId, msg);
        }
        this.events.onRemoteState(statePayload);
        break;
      }

      case 'DIED': {
        // Anti-spoofing: Host strictly enforces deathPeerId = senderId, discarding client-provided msg.peerId
        const deathPeerId = this.isHost ? (senderId || msg.peerId) : (msg.peerId || senderId);
        if (this.isHost && senderId) {
          msg.peerId = senderId;
          this.broadcastToOthers(senderId, msg);
        }
        this.events.onRemoteDied(msg.score, msg.distance, deathPeerId);
        break;
      }

      case 'REMATCH_REQUEST':
        this.events.onRematchRequested(msg.seed);
        break;

      case 'REMATCH_READY':
        if (this.isHost && senderId) {
          this.broadcastToOthers(senderId, msg);
        }
        if (this.events.onRematchReady) {
          this.events.onRematchReady();
        }
        break;

      case 'CANCEL_REMATCH':
        if (this.isHost && senderId) {
          this.broadcastToOthers(senderId, msg);
        }
        if (this.events.onCancelRematch) {
          this.events.onCancelRematch();
        }
        break;

      case 'PLAYER_IN_LOBBY':
        if (this.isHost && senderId) {
          this.broadcastToOthers(senderId, msg);
        }
        if (this.events.onRemoteInLobby) {
          this.events.onRemoteInLobby();
        }
        break;

      case 'PLAYER_READY_IN_LOBBY':
        if (this.isHost && senderId) {
          this.broadcastToOthers(senderId, msg);
        }
        if (this.events.onRemoteReadyInLobby) {
          this.events.onRemoteReadyInLobby();
        }
        break;

      case 'KICKED':
        // Privilege escalation protection: Host is immune to KICKED packets
        if (this.isHost) {
          break;
        }
        if (this.events.onKicked) {
          this.events.onKicked(msg.reason);
        }
        break;

      case 'PING':
        if (fromConn) {
          fromConn.send({ type: 'PONG', t: msg.t });
        } else if (this.connection) {
          this.connection.send({ type: 'PONG', t: msg.t });
        } else {
          this.send({ type: 'PONG', t: msg.t });
        }
        break;

      case 'PONG': {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const sampleRtt = Math.max(0, now - msg.t);
        const peerKey = fromConn?.peer || 'default';
        const prevRtt = this.peerRtts.get(peerKey);
        const smoothed = applyEWMA(sampleRtt, prevRtt, EWMA_ALPHA);
        this.peerRtts.set(peerKey, smoothed);
        this.smoothedRtt = smoothed;
        this.currentPingMs = Math.round(smoothed / 2);
        this.events.onPingUpdated(this.currentPingMs);
        break;
      }
    }
  }

  private broadcastToOthers(excludePeerId: string, msg: NetMessage): void {
    if (!this.isHost) return;
    for (const [peerId, conn] of this.connections.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        try {
          conn.send(msg);
        } catch {}
      }
    }
  }

  kickPeer(peerId?: string, reason: string = 'Expulsado por el anfitrión'): void {
    if (this.isHost) {
      if (peerId && this.connections.has(peerId)) {
        const conn = this.connections.get(peerId)!;
        try {
          conn.send({ type: 'KICKED', reason });
        } catch {}
        setTimeout(() => {
          try {
            conn.close();
          } catch {}
          this.connections.delete(peerId);
          this.peerProfiles.delete(peerId);
        }, 50);
      } else {
        // Kick all
        for (const conn of this.connections.values()) {
          try {
            conn.send({ type: 'KICKED', reason });
            conn.close();
          } catch {}
        }
        this.connections.clear();
        this.peerProfiles.clear();
      }
    } else if (this.connection && this.connection.open) {
      try {
        this.connection.send({ type: 'KICKED', reason });
      } catch {}
      setTimeout(() => {
        if (this.connection) {
          this.connection.close();
          this.connection = null;
        }
      }, 50);
    }
  }

  send(msg: NetMessage): void {
    if (msg.type === 'STATE' && msg.seq === undefined) {
      msg.seq = ++this.localSeq;
    }
    if (this.isHost) {
      for (const conn of this.connections.values()) {
        if (conn.open) {
          try {
            conn.send(msg);
          } catch {}
        }
      }
    } else if (this.connection && this.connection.open) {
      try {
        this.connection.send(msg);
      } catch {}
    }
  }

  private startPing(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.send({ type: 'PING', t: now });
    }, 2000);
  }

  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.connections.clear();
    this.peerProfiles.clear();
    this.lastReceivedSeq.clear();
    this.peerRtts.clear();
    this.localSeq = 0;
    this.smoothedRtt = 0;
    this.currentPingMs = 0;

    if (this.connection) {
      try {
        this.connection.close();
      } catch {}
      this.connection = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    this.isHost = false;
    this.roomId = null;
  }
}
