/**
 * Checks whether a room code can be joined, preventing the host
 * from connecting to their own room in the same browser session.
 */
export function canJoinRoom(
  code: string,
  currentHostRoom: string | null,
  isOwnHostTab: boolean = false
): boolean {
  if (!code || !code.trim()) return false;
  if (!currentHostRoom) return true;
  if (isOwnHostTab) return false;
  return code.trim().toUpperCase() !== currentHostRoom.trim().toUpperCase();
}

/**
 * Formats a clean, readable room URL for clipboard and sharing.
 */
export function formatCleanRoomUrl(origin: string, pathname: string, roomCode: string): string {
  const cleanCode = (roomCode || '').trim().toUpperCase();
  const cleanPath = pathname === '/' ? '' : pathname;
  const base = `${origin}${cleanPath}`.replace(/\/+$/, '');
  return `${base}/?room=${cleanCode}`;
}

export interface HostLobbyButtonsState {
  showStartBtn: boolean;
  showReturnGameBtn: boolean;
}

/**
 * Determines which buttons the host should see in the lobby:
 * - If no match has been played yet with this rival: show Start button (if rival connected).
 * - If an active match has already occurred: hide Start button, only show Return to Game button.
 */
export function getHostLobbyButtonsState(
  isRivalConnected: boolean,
  hasPlayedMatchWithCurrentRival: boolean
): HostLobbyButtonsState {
  if (!isRivalConnected) {
    return { showStartBtn: false, showReturnGameBtn: false };
  }
  if (hasPlayedMatchWithCurrentRival) {
    return { showStartBtn: false, showReturnGameBtn: true };
  }
  return { showStartBtn: true, showReturnGameBtn: false };
}

export interface DisconnectHandlingPlan {
  shouldContinueRunning: boolean;
  noticeTitle: string;
  noticeSubtitle: string;
  noticeStatus: string;
  showReturnToLobbyBtn: boolean;
  canRematch: boolean;
}

/**
 * Determines how a peer disconnection should be handled:
 * - If match is currently running and local is not dead: let local continue running!
 * - Once match finishes (or if already finished): show abandonment notice and return to lobby button.
 */
export function planDisconnectHandling(
  isMatchRunning: boolean,
  isLocalGameOver: boolean
): DisconnectHandlingPlan {
  if (isMatchRunning && !isLocalGameOver) {
    return {
      shouldContinueRunning: true,
      noticeTitle: 'PARTIDA FINALIZADA',
      noticeSubtitle: 'EL RIVAL ABANDONÓ LA PARTIDA',
      noticeStatus: 'El rival abandonó la partida.',
      showReturnToLobbyBtn: true,
      canRematch: false,
    };
  }
  return {
    shouldContinueRunning: false,
    noticeTitle: 'PARTIDA FINALIZADA',
    noticeSubtitle: 'EL RIVAL ABANDONÓ LA PARTIDA',
    noticeStatus: 'El rival abandonó la partida.',
    showReturnToLobbyBtn: true,
    canRematch: false,
  };
}

export const MAX_PLAYERS = 4;

/**
 * Checks whether a room has reached its maximum player capacity.
 */
export function isRoomFull(currentConnectedCount: number, maxPlayers: number = MAX_PLAYERS): boolean {
  return currentConnectedCount >= maxPlayers;
}

/**
 * Formats P2P connection errors into user-friendly Spanish messages.
 * Prevents raw technical English errors (e.g., 'Could not connect to peer ...') from showing in the UI.
 */
export function formatP2PErrorMessage(err: unknown): string {
  if (!err) return 'Error de conexión';

  let type = '';
  let msg = '';

  if (typeof err === 'string') {
    msg = err;
  } else if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    type = typeof record.type === 'string' ? record.type : '';
    msg = typeof record.message === 'string' ? record.message : String(err);
  }

  const lowerMsg = msg.toLowerCase();
  const lowerType = type.toLowerCase();

  if (
    lowerType === 'room-full' ||
    lowerMsg.includes('sala está llena') ||
    lowerMsg.includes('room-full') ||
    lowerMsg.includes('room is full')
  ) {
    return 'La sala está llena. Ya se ha alcanzado el límite máximo de 4 jugadores.';
  }

  if (
    lowerType === 'peer-unavailable' ||
    lowerMsg.includes('could not connect to peer') ||
    lowerMsg.includes('peer-unavailable')
  ) {
    return 'No se pudo conectar a la sala. Es posible que el anfitrión haya cerrado la sala o el código sea incorrecto.';
  }

  if (
    lowerType === 'unavailable-id' ||
    lowerMsg.includes('id taken') ||
    lowerMsg.includes('unavailable-id')
  ) {
    return 'El código de sala ya está en uso. Intenta crear otra sala.';
  }

  if (
    lowerType === 'network' ||
    lowerType === 'server-error' ||
    lowerMsg.includes('lost connection to server') ||
    lowerMsg.includes('network error')
  ) {
    return 'Error de conexión con el servidor. Revisa tu conexión a internet.';
  }

  if (lowerMsg.includes('tiempo de espera') || lowerMsg.includes('timeout')) {
    return 'Tiempo de espera agotado al conectar a la sala.';
  }

  return msg || 'Error de conexión';
}

export interface SoloModalDisplayState {
  distanceText: string;
  statusText: string;
  showSeriesBadge: boolean;
}

/**
 * Formats clean, non-duplicated stats for the Solo Mode game over modal.
 */
export function formatSoloModalDisplay(
  currentDistance: number,
  previousHighScore: number
): SoloModalDisplayState {
  const isNewRecord = currentDistance > previousHighScore;
  const distanceText = `DISTANCIA: ${currentDistance} METROS`;

  let statusText = '';
  if (isNewRecord && currentDistance > 0) {
    statusText = '¡NUEVO RECORD PERSONAL!';
  } else if (previousHighScore > 0) {
    statusText = `RECORD: ${previousHighScore} METROS`;
  }

  return {
    distanceText,
    statusText,
    showSeriesBadge: false, // In solo mode, series score badge is never shown to avoid duplication
  };
}

/**
 * Sanitizes and extracts the 4-character room code from either:
 * - A full URL (?room=ABCD or &room=ABCD)
 * - A query string prefix (room=ABCD)
 * - A direct uppercase/lowercase code with optional whitespace or dashes
 */
export function extractRoomCode(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // Try extracting parameter matching ?room=... or &room=... or room=...
  const paramMatch =
    trimmed.match(/[?&]room=([A-Za-z0-9]{1,10})/i) ||
    trimmed.match(/^room=([A-Za-z0-9]{1,10})/i);

  if (paramMatch && paramMatch[1]) {
    return paramMatch[1].slice(0, 4).toUpperCase();
  }

  // If it's a URL or path with query params
  if (trimmed.includes('://') || trimmed.includes('/?')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const code = url.searchParams.get('room');
      if (code) return code.slice(0, 4).toUpperCase();
      return '';
    } catch {
      return '';
    }
  }

  // If direct URL path without protocol or room parameter
  if (trimmed.includes('/') || trimmed.includes('.')) {
    return '';
  }

  // Direct code input: strip non-alphanumeric and take first 4 characters
  return trimmed.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
}

