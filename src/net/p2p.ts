import { Peer, DataConnection } from 'peerjs';

export interface PlayerProfile {
  name: string;
  color: string;
  skinId: string;
}

export type NetMessage =
  | { type: 'HANDSHAKE'; profile: PlayerProfile }
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

      this.peer.on('error', (err) => {
        this.events.onError(err.message || 'Error de conexión');
        reject(err);
      });

      this.peer.on('connection', (conn) => {
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
      this.peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer.on('open', () => {
        if (!this.peer) return;
        const conn = this.peer.connect(fullPeerId, { reliable: true });
        this.setupConnection(conn);
        resolve();
      });

      this.peer.on('error', (err) => {
        this.events.onError(err.message || 'Error al unirse a la sala');
        reject(err);
      });
    });
  }

  private setupConnection(conn: DataConnection): void {
    this.connection = conn;

    conn.on('open', () => {
      // 1. Send local handshake
      this.send({ type: 'HANDSHAKE', profile: this.localProfile });

      // 2. Start ping interval
      this.startPing();
    });

    conn.on('data', (raw: any) => {
      const msg = raw as NetMessage;
      this.handleMessage(msg);
    });

    conn.on('close', () => {
      this.events.onDisconnected();
      this.cleanup();
    });

    conn.on('error', (err) => {
      this.events.onError(err.message || 'Error en canal de datos');
    });
  }

  private handleMessage(msg: NetMessage): void {
    switch (msg.type) {
      case 'HANDSHAKE':
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

      case 'PING':
        this.send({ type: 'PONG', t: msg.t });
        break;

      case 'PONG':
        const rtt = Date.now() - msg.t;
        this.events.onPingUpdated(Math.round(rtt / 2));
        break;
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
      this.connection.close();
      this.connection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
