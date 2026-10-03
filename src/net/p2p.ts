import { Peer, DataConnection } from 'peerjs';
import { formatP2PErrorMessage } from '../core/lobby-helpers';

export interface PlayerProfile {
  name: string;
  color: string;
  skinId: string;
}

export type NetMessage =
  | { type: 'HANDSHAKE'; profile: PlayerProfile }
  | { type: 'HANDSHAKE_ACK'; profile: PlayerProfile }
  | { type: 'PROFILE_UPDATE'; profile: PlayerProfile }
  | { type: 'START_GAME'; seed: number; startTimestamp: number }
  | {
      type: 'STATE';
      y: number;
      vy: number;
      isDucking: boolean;
      isGrounded: boolean;
      distance: number;
      score: number;
      t: number;
    }
  | { type: 'DIED'; score: number; distance: number }
  | { type: 'REMATCH_REQUEST'; seed: number }
  | { type: 'REMATCH_READY'; seed?: number }
  | { type: 'CANCEL_REMATCH' }
  | { type: 'PLAYER_IN_LOBBY' }
  | { type: 'PLAYER_READY_IN_LOBBY' }
  | { type: 'KICKED'; reason?: string }
  | { type: 'PING'; t: number }
  | { type: 'PONG'; t: number };

export interface P2PEvents {
  onConnected: (remoteProfile: PlayerProfile) => void;
  onDisconnected: () => void;
  onProfileUpdated?: (profile: PlayerProfile) => void;
  onStartGame: (seed: number, startTimestamp: number) => void;
  onRemoteState: (state: {
    y: number;
    vy: number;
    isDucking: boolean;
    isGrounded: boolean;
    distance: number;
    score: number;
  }) => void;
  onRemoteDied: (finalScore: number, distance: number) => void;
  onRematchRequested: (seed: number) => void;
  onRematchReady?: () => void;
  onCancelRematch?: () => void;
  onRemoteInLobby?: () => void;
  onRemoteReadyInLobby?: () => void;
  onKicked?: (reason?: string) => void;
  onPingUpdated: (pingMs: number) => void;
  onError: (error: string) => void;
}

export class P2PManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private events: P2PEvents;
  private localProfile: PlayerProfile;
  public isHost: boolean = false;
  public roomId: string | null = null;
  private pingInterval: any = null;

  constructor(localProfile: PlayerProfile, events: P2PEvents) {
    this.localProfile = localProfile;
    this.events = events;
  }

  setLocalProfile(profile: PlayerProfile): void {
    this.localProfile = profile;
    if (this.connection && this.connection.open) {
      this.send({ type: 'PROFILE_UPDATE', profile });
    }
  }

  get isConnected(): boolean {
    return !!(this.connection && this.connection.open);
  }

  get hasActivePeer(): boolean {
    return !!(this.peer && !this.peer.destroyed);
  }

  /**
   * Host creates a room with an easy-to-type 4-letter alphanumeric code.
   */
  async createRoom(): Promise<string> {
    this.cleanup();
    this.isHost = true;

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const fullPeerId = `dino1v1-${code}`;
    this.roomId = code;

    return new Promise((resolve, reject) => {
      this.peer = new Peer(fullPeerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer.on('open', () => {
        resolve(code);
      });

      this.peer.on('disconnected', () => {
        // Auto-reconnect host peer to signaling broker if socket dropped
        if (this.isHost && this.peer && !this.peer.destroyed) {
          try {
            this.peer.reconnect();
          } catch {}
        }
      });

      this.peer.on('error', (err) => {
        const friendlyMsg = formatP2PErrorMessage(err);
        this.events.onError(friendlyMsg);
        reject(err);
      });

      this.peer.on('connection', (conn) => {
        if (this.connection) {
          try {
            this.connection.close();
          } catch {}
          this.connection = null;
        }
        this.setupConnection(conn);
      });
    });
  }

  /**
   * Guest joins an existing room by code.
   */
  async joinRoom(roomCode: string): Promise<void> {
    this.cleanup();
    this.isHost = false;
    this.roomId = roomCode.toUpperCase().trim();
    const fullPeerId = `dino1v1-${this.roomId}`;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let timeoutId: any = null;

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

      timeoutId = setTimeout(() => {
        safeReject(new Error('Tiempo de espera agotado al conectar a la sala.'));
      }, 10000);

      try {
        this.peer = new Peer({
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });
      } catch (err) {
        safeReject(err);
        return;
      }

      this.peer.on('open', () => {
        if (!this.peer || isSettled) return;
        try {
          const conn = this.peer.connect(fullPeerId, { reliable: true });
          conn.on('error', (err) => {
            if (!isSettled) {
              safeReject(err);
            }
          });
          this.setupConnection(conn, () => {
            safeResolve();
          });
        } catch (err) {
          safeReject(err);
        }
      });

      this.peer.on('error', (err) => {
        if (!isSettled) {
          safeReject(err);
        } else {
          const friendlyMsg = formatP2PErrorMessage(err);
          this.events.onError(friendlyMsg);
        }
      });
    });
  }

  private setupConnection(conn: DataConnection, onOpen?: () => void): void {
    this.connection = conn;

    const handleOpen = () => {
      // 1. Send local handshake
      this.send({ type: 'HANDSHAKE', profile: this.localProfile });

      // 2. Start ping interval
      this.startPing();

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
      this.handleMessage(msg);
    });

    conn.on('close', () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      if (this.connection === conn) {
        this.connection = null;
      }
      this.events.onDisconnected();

      // Only destroy peer if we are NOT the host!
      // Host keeps its peer alive and listening for new/reconnected rivals.
      if (!this.isHost) {
        this.cleanup();
      }
    });

    conn.on('error', (err) => {
      const friendlyMsg = formatP2PErrorMessage(err);
      this.events.onError(friendlyMsg);
    });
  }

  private handleMessage(msg: NetMessage): void {
    switch (msg.type) {
      case 'HANDSHAKE':
        // Acknowledge with own profile so both sides are guaranteed connected
        this.send({ type: 'HANDSHAKE_ACK', profile: this.localProfile });
        this.events.onConnected(msg.profile);
        break;

      case 'HANDSHAKE_ACK':
        this.events.onConnected(msg.profile);
        break;

      case 'PROFILE_UPDATE':
        if (this.events.onProfileUpdated) {
          this.events.onProfileUpdated(msg.profile);
        }
        break;

      case 'START_GAME':
        this.events.onStartGame(msg.seed, msg.startTimestamp);
        break;

      case 'STATE':
        this.events.onRemoteState({
          y: msg.y,
          vy: msg.vy,
          isDucking: msg.isDucking,
          isGrounded: msg.isGrounded,
          distance: msg.distance,
          score: msg.score,
        });
        break;

      case 'DIED':
        this.events.onRemoteDied(msg.score, msg.distance);
        break;

      case 'REMATCH_REQUEST':
        this.events.onRematchRequested(msg.seed);
        break;

      case 'REMATCH_READY':
        if (this.events.onRematchReady) {
          this.events.onRematchReady();
        }
        break;

      case 'CANCEL_REMATCH':
        if (this.events.onCancelRematch) {
          this.events.onCancelRematch();
        }
        break;

      case 'PLAYER_IN_LOBBY':
        if (this.events.onRemoteInLobby) {
          this.events.onRemoteInLobby();
        }
        break;

      case 'PLAYER_READY_IN_LOBBY':
        if (this.events.onRemoteReadyInLobby) {
          this.events.onRemoteReadyInLobby();
        }
        break;

      case 'KICKED':
        if (this.events.onKicked) {
          this.events.onKicked(msg.reason);
        }
        break;

      case 'PING':
        this.send({ type: 'PONG', t: msg.t });
        break;

      case 'PONG':
        const rtt = Date.now() - msg.t;
        this.events.onPingUpdated(Math.round(rtt / 2));
        break;
    }
  }

  kickPeer(reason: string = 'Expulsado por el anfitrión'): void {
    if (this.connection && this.connection.open) {
      try {
        this.send({ type: 'KICKED', reason });
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
    if (this.connection && this.connection.open) {
      this.connection.send(msg);
    }
  }

  private startPing(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', t: Date.now() });
    }, 2000);
  }

  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
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
