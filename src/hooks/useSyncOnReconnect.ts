import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getPending, removePending } from '@/lib/offlineQueue';
import { checkout } from '@/lib/api';

/**
 * When app comes to foreground, try to flush pending sales.
 * Call this in POSScreen or Root.
 */
export function useSyncOnReconnect() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const pend = await getPending();
      for (const p of pend) {
        try {
          await checkout(p.total, p.items as never);
          await removePending(p.id);
        } catch {
          break; // stop on first failure (still offline)
        }
      }
    });
    return () => sub.remove();
  }, []);
}
