import { Peer, DataConnection } from 'peerjs';
import { formatP2PErrorMessage, MAX_PLAYERS } from '../core/lobby-helpers';

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
  | { type: 'START_GAME'; seed: number; startTimestamp: number }
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
  onStartGame: (seed: number, startTimestamp: number) => void;
  onRemoteState: (state: {
    peerId?: string;
    y: number;
    vy: number;
    isDucking: boolean;
    isGrounded: boolean;
    distance: number;
    score: number;
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

  constructor(localProfile: PlayerProfile, events: P2PEvents) {
    this.localProfile = localProfile;
    this.events = events;
  }

  setLocalProfile(profile: PlayerProfile): void {
    this.localProfile = profile;
    this.send({ type: 'PROFILE_UPDATE', profile });
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
        this.handleIncomingConnection(conn);
      });
    });
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
          this.connection = conn;
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
    const peerKey = conn.peer || `peer-${this.connections.size + 1}`;
    if (this.isHost) {
      this.connections.set(peerKey, conn);
    } else {
      this.connection = conn;
    }

    const handleOpen = () => {
      // Send local handshake
      try {
        conn.send({ type: 'HANDSHAKE', profile: this.localProfile });
      } catch {}

      if (!this.isHost) {
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
        this.events.onStartGame(msg.seed, msg.startTimestamp);
        break;

      case 'STATE':
        const statePayload = {
          peerId: msg.peerId || senderId,
          y: msg.y,
          vy: msg.vy,
          isDucking: msg.isDucking,
          isGrounded: msg.isGrounded,
          distance: msg.distance,
          score: msg.score,
        };
        if (this.isHost && senderId) {
          msg.peerId = senderId;
          this.broadcastToOthers(senderId, msg);
        }
        this.events.onRemoteState(statePayload);
        break;

      case 'DIED':
        const deathPeerId = msg.peerId || senderId;
        if (this.isHost && senderId) {
          msg.peerId = senderId;
          this.broadcastToOthers(senderId, msg);
        }
        this.events.onRemoteDied(msg.score, msg.distance, deathPeerId);
        break;

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
        if (this.events.onKicked) {
          this.events.onKicked(msg.reason);
        }
        break;

      case 'PING':
        if (fromConn) {
          fromConn.send({ type: 'PONG', t: msg.t });
        } else {
          this.send({ type: 'PONG', t: msg.t });
        }
        break;

      case 'PONG':
        const rtt = Date.now() - msg.t;
        this.events.onPingUpdated(Math.round(rtt / 2));
        break;
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
      this.send({ type: 'PING', t: Date.now() });
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
