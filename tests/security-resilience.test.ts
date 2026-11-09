import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, markAllRemotePlayersDead, checkAllPlayersDead } from '../src/render/ui-helpers';
import { P2PManager, PlayerProfile, NetMessage } from '../src/net/p2p';

describe('Security & Resilience Suite (Ticket 1)', () => {
  // -------------------------------------------------------------
  // 1. Strict XSS Neutralization with escapeHtml()
  // -------------------------------------------------------------
  describe('XSS Sanitization: escapeHtml()', () => {
    it('escapes standard script tags and html tags', () => {
      const malicious = "<script>alert('pwned')</script>";
      const sanitized = escapeHtml(malicious);
      expect(sanitized).toBe("&lt;script&gt;alert(&#39;pwned&#39;)&lt;/script&gt;");
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('neutralizes image error handlers and attribute break-outs', () => {
      const payload = '"><img src=x onerror="alert(document.cookie)">';
      const sanitized = escapeHtml(payload);
      expect(sanitized).toBe('&quot;&gt;&lt;img src=x onerror=&quot;alert(document.cookie)&quot;&gt;');
      expect(sanitized).not.toContain('<img');
      expect(sanitized).not.toContain('">');
    });

    it('escapes all HTML special characters (&, <, >, ", \')', () => {
      const input = `Dino & Friends: <"The 'Best' Game">`;
      const expected = `Dino &amp; Friends: &lt;&quot;The &#39;Best&#39; Game&quot;&gt;`;
      expect(escapeHtml(input)).toBe(expected);
    });

    it('handles falsy or empty values safely', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as unknown as string)).toBe('');
      expect(escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('preserves clean text without alterations', () => {
      const clean = 'Player_123';
      expect(escapeHtml(clean)).toBe('Player_123');
    });
  });

  // -------------------------------------------------------------
  // 2. Strict Sender Forcing on DIED (Anti-Spoofing on Host)
  // -------------------------------------------------------------
  describe('Anti-Spoofing: Host forces deathPeerId = senderId on DIED', () => {
    const hostProfile: PlayerProfile = { name: 'HostDino', color: '#fff', skinId: 'classic' };

    it('ignores client msg.peerId and forces deathPeerId = senderId in onRemoteDied and broadcasts', () => {
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

      const manager = new P2PManager(hostProfile, events);
      manager.isHost = true;

      // Mock another guest connection for broadcasting verification
      const innocentPeerConn = { peer: 'innocent-peer', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };
      const attackerConn = { peer: 'attacker-peer', open: true, send: vi.fn(), close: vi.fn(), on: vi.fn() };

      (manager as any).handleIncomingConnection(innocentPeerConn);
      (manager as any).handleIncomingConnection(attackerConn);

      // Attacker attempts to spoof death of innocent-peer
      const spoofedDiedMsg: NetMessage = {
        type: 'DIED',
        peerId: 'innocent-peer', // Spoofed!
        score: 50,
        distance: 120,
      };

      (manager as any).handleMessage(spoofedDiedMsg, attackerConn);

      // Host MUST invoke onRemoteDied with attacker-peer as deathPeerId, ignoring spoofed peerId
      expect(events.onRemoteDied).toHaveBeenCalledWith(50, 120, 'attacker-peer');
      expect(events.onRemoteDied).not.toHaveBeenCalledWith(50, 120, 'innocent-peer');

      // Host MUST broadcast the death of attacker-peer to innocent-peer, overriding spoofed peerId
      expect(innocentPeerConn.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DIED',
          peerId: 'attacker-peer',
        })
      );
    });

    it('preserves msg.peerId for guest client receiving broadcast DIED from host', () => {
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

      const manager = new P2PManager(hostProfile, events);
      manager.isHost = false; // Guest mode

      const hostBroadcastDiedMsg: NetMessage = {
        type: 'DIED',
        peerId: 'player-3',
        score: 200,
        distance: 450,
      };

      (manager as any).handleMessage(hostBroadcastDiedMsg);

      expect(events.onRemoteDied).toHaveBeenCalledWith(200, 450, 'player-3');
    });
  });

  // -------------------------------------------------------------
  // 3. Host Immunity to KICKED Packets (Privilege Escalation)
  // -------------------------------------------------------------
  describe('Privilege Escalation Prevention: Host Immunity to KICKED', () => {
    it('Host ignores incoming KICKED packets and does not trigger onKicked', () => {
      const onKicked = vi.fn();
      const manager = new P2PManager(
        { name: 'Host', color: '#fff', skinId: 'classic' },
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

      manager.isHost = true;

      // Malicious guest sends KICKED to host
      (manager as any).handleMessage({ type: 'KICKED', reason: 'You are kicked by guest' });

      expect(onKicked).not.toHaveBeenCalled();
    });

    it('Guest client processes KICKED packets normally', () => {
      const onKicked = vi.fn();
      const manager = new P2PManager(
        { name: 'Guest', color: '#fff', skinId: 'classic' },
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

      manager.isHost = false;

      (manager as any).handleMessage({ type: 'KICKED', reason: 'Expulsado por anfitrión' });

      expect(onKicked).toHaveBeenCalledWith('Expulsado por anfitrión');
    });
  });

  // -------------------------------------------------------------
  // 4. Soft-Lock Prevention on Host Disconnect (markAllRemotePlayersDead)
  // -------------------------------------------------------------
  describe('Soft-Lock Prevention: Host Disconnect in Multi-Player Matches', () => {
    it('markAllRemotePlayersDead marks all peers in remotePlayers as isDead = true', () => {
      const remotePlayers = new Map<string, any>([
        ['host', { peerId: 'host', state: { isDead: false, distance: 300 } }],
        ['guest-2', { peerId: 'guest-2', state: { isDead: false, distance: 250 } }],
      ]);

      markAllRemotePlayersDead(remotePlayers);

      expect(remotePlayers.get('host')?.state.isDead).toBe(true);
      expect(remotePlayers.get('guest-2')?.state.isDead).toBe(true);
    });

    it('prevents LOCAL_CRASHED_SPECTATING soft-lock when local player crashes after host disconnects', () => {
      const remotePlayers = new Map<string, any>([
        ['host', { peerId: 'host', state: { isDead: false, distance: 100 } }],
        ['peer-2', { peerId: 'peer-2', state: { isDead: false, distance: 150 } }],
      ]);

      // Before host disconnect: if local dies while rivals are alive, checkAllPlayersDead is false (would cause spectating)
      const isDeadBefore = checkAllPlayersDead(true, false, remotePlayers);
      expect(isDeadBefore).toBe(false);

      // Host disconnects: mark all rivals dead
      markAllRemotePlayersDead(remotePlayers);

      // Now when local player crashes, checkAllPlayersDead evaluates to true!
      const isDeadAfter = checkAllPlayersDead(true, false, remotePlayers);
      expect(isDeadAfter).toBe(true);
      // Because checkAllPlayersDead is true, local game ends cleanly with modal, NOT soft-locked in LOCAL_CRASHED_SPECTATING
    });
  });
});
