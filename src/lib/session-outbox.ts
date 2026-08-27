import { StudySession } from '@/types/word';
import type { FsrsMode, FsrsState } from '@/lib/fsrs';

/**
 * Outbox voor werk dat nog naar Supabase moet.
 *
 * Wat je hebt gedaan wordt eerst *synchroon* in localStorage gezet en pas daarna
 * verstuurd. Valt de verbinding weg of sluit je de app voordat de write klaar
 * is, dan staat het er bij de volgende start nog en gaat het alsnog mee. Zo gaat
 * er geen les en geen beoordeling verloren.
 */

const PREFIX = 'vocale.pendingSessions';
const STATE_PREFIX = 'vocale.pendingFsrsStates';
const MAX_PENDING = 50;
/** Ruimer dan sessies: één sessie levert tientallen beoordelingen op. */
const MAX_PENDING_STATES = 500;

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


// ─── FSRS-STATES ─────────────────────────────────────────────────────────────

/**
 * Een beoordeling die nog niet vaststaat in de database.
 *
 * Sessies hadden deze bescherming al, FSRS-states niet — en juist daar deed het
 * pijn: het scherm belooft "+3 dagen" terwijl de rij nooit is aangekomen, en het
 * woord komt de volgende dag terug alsof je het nooit hebt getypt.
 */
export interface PendingFsrsState {
  cardId: string;
  mode:   FsrsMode;
  state:  FsrsState;
}

function stateKey(userId: string): string {
  return `${STATE_PREFIX}.${userId}`;
}

/** Eén wachtrij-ingang per (kaart, modus); een nieuwere beoordeling wint. */
function stateId(entry: PendingFsrsState): string {
  return `${entry.cardId}::${entry.mode}`;
}

export function readPendingFsrsStates(userId: string): PendingFsrsState[] {
  try {
    const raw = localStorage.getItem(stateKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is PendingFsrsState =>
      !!e && typeof e.cardId === 'string' && typeof e.mode === 'string' && !!e.state);
  } catch {
    return [];
  }
}

function writePendingFsrsStates(userId: string, list: PendingFsrsState[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(stateKey(userId));
    else localStorage.setItem(stateKey(userId), JSON.stringify(list.slice(-MAX_PENDING_STATES)));
  } catch {
    // Quota vol of private mode: dan blijft alleen de directe write over.
  }
}

export function queuePendingFsrsState(userId: string, entry: PendingFsrsState): void {
  const id = stateId(entry);
  writePendingFsrsStates(userId, [
    ...readPendingFsrsStates(userId).filter(e => stateId(e) !== id),
    entry,
  ]);
}

export function unqueuePendingFsrsState(userId: string, cardId: string, mode: FsrsMode): void {
  const id = `${cardId}::${mode}`;
  const list = readPendingFsrsStates(userId);
  const next = list.filter(e => stateId(e) !== id);
  if (next.length !== list.length) writePendingFsrsStates(userId, next);
}
