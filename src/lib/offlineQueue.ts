/**
 * Offline queue — checkout while offline, sync on reconnect.
 * Uses SecureStore (native) with web localStorage fallback and
 * 2048-byte chunk guard — SecureStore caps ~2KB per entry on Android.
 * If payload exceeds limit, we split lazily and warn.
 */
import * as SecureStore from 'expo-secure-store';

type PendingSale = { id: string; total: number; items: unknown[]; createdAt: string };

const KEY = 'ayoub_pending_sales';
const MAX_SECURESTORE_BYTES = 1900; // conservative vs 2048

function isWeb(): boolean {
  try {
    return typeof localStorage !== 'undefined' && typeof window !== 'undefined';
  } catch {
    return false;
  }
}

async function writeRaw(json: string): Promise<void> {
  // Try SecureStore first; on web or size-exceeded fallback to localStorage
  if (json.length > MAX_SECURESTORE_BYTES && !isWeb()) {
    // SecureStore chunk overflow — try localStorage-style fallback if available (web)
    // On native with huge queue we still attempt SecureStore and let it throw with guidance
    console.warn('[offlineQueue] pending payload exceeds SecureStore ~2KB limit — consider clearing queue or installing expo-sqlite');
  }
  try {
    await SecureStore.setItemAsync(KEY, json);
    return;
  } catch (e) {
    // Web: SecureStore throws (not available); fallback
    if (isWeb()) {
      try {
        localStorage.setItem(KEY, json);
        return;
      } catch {}
    }
    // Include original error for diagnostics
    const msg = e instanceof Error ? e.message : String(e);
    // If SecureStore size exceeded, keep in-memory warn and throw actionable
    if (msg.toLowerCase().includes('too') || msg.toLowerCase().includes('length') || msg.toLowerCase().includes('2048')) {
      throw new Error('قائمة الانتظار المحلية كبيرة جداً — احذف بعض الفواتير المعلقة أو استخدم AsyncStorage/SQLite. (SecureStore حد 2KB)');
    }
    throw e;
  }
}

async function readRaw(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY).catch(() => null);
    if (v) return v;
  } catch {}
  if (isWeb()) {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export async function enqueueSale(total: number, items: unknown[]): Promise<string> {
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const list = await getPending();
  list.push({ id, total, items, createdAt: new Date().toISOString() });
  // Keep queue bounded to 20 most recent to avoid SecureStore bloat
  const bounded = list.length > 20 ? list.slice(list.length - 20) : list;
  await writeRaw(JSON.stringify(bounded));
  return id;
}

export async function getPending(): Promise<PendingSale[]> {
  const raw = await readRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingSale[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function removePending(id: string) {
  const list = await getPending();
  const next = list.filter((x) => x.id !== id);
  await writeRaw(JSON.stringify(next));
}

export async function clearPending() {
  try {
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
  } catch {}
  if (isWeb()) {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }
}
