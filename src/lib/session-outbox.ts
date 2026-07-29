import { StudySession } from '@/types/word';

/**
 * Outbox voor studiesessies.
 *
 * Een afgeronde les wordt eerst *synchroon* in localStorage gezet en pas daarna
 * naar Supabase gestuurd. Valt de verbinding weg of sluit de gebruiker de app
 * voordat de insert klaar is, dan staat de sessie nog in de outbox en wordt hij
 * bij de volgende start alsnog verstuurd. Zo gaat er geen les verloren.
 */

const PREFIX = 'vocale.pendingSessions';
const MAX_PENDING = 50;

export type PendingSession = Omit<StudySession, 'id'> & { clientId: string };

function key(userId: string): string {
  return `${PREFIX}.${userId}`;
}

export function makeClientId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readPendingSessions(userId: string): PendingSession[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is PendingSession => !!s && typeof s.clientId === 'string');
  } catch {
    return [];
  }
}

function writePendingSessions(userId: string, list: PendingSession[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), JSON.stringify(list.slice(-MAX_PENDING)));
  } catch {
    // Quota vol of private mode: dan blijft alleen de directe insert over.
  }
}

export function queuePendingSession(userId: string, session: PendingSession): void {
  const list = readPendingSessions(userId);
  if (list.some(s => s.clientId === session.clientId)) return;
  writePendingSessions(userId, [...list, session]);
}

export function unqueuePendingSession(userId: string, clientId: string): void {
  const list = readPendingSessions(userId);
  const next = list.filter(s => s.clientId !== clientId);
  if (next.length !== list.length) writePendingSessions(userId, next);
}
