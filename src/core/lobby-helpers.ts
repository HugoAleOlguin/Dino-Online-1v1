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
