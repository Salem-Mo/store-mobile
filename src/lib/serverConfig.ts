/**
 * Single source of truth for the backend (Next.js) server URL.
 *
 * Change the IP in ONE place only: `.env` → `EXPO_PUBLIC_WEB_URL`.
 * Everything else (api client, settings screen, fallbacks) reads from here.
 *
 * Resolution order (first non-empty wins):
 *   1. `process.env.EXPO_PUBLIC_WEB_URL`  (.env — Expo Go dev / EAS Secrets)
 *   2. `Constants.expoConfig.extra.EXPO_PUBLIC_WEB_URL` (injected at build
 *      time by app.config.js from the same .env — no hardcoding in app.json)
 *   3. `EXPO_PUBLIC_SERVER_IP` + `EXPO_PUBLIC_SERVER_PORT` (optional split
 *      vars, same order: process.env first, then extra)
 *   4. `http://localhost:3000` (Android emulator auto-maps to 10.0.2.2)
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extra = ((Constants.expoConfig as any)?.extra ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Constants.manifest as any)?.extra ||
  {}) as Record<string, string | undefined>;

function readEnv(key: string): string {
  const fromProcess =
    typeof process !== 'undefined'
      ? ((process.env as Record<string, string | undefined>)[key] || '')
      : '';
  if (fromProcess.trim()) return fromProcess.trim();
  const fromExtra = (extra[key] || '').trim();
  return fromExtra;
}

/** Add http:// when the user puts a bare `192.168.x.x:3000` in .env. */
export function normalizeBaseUrl(raw: string): string {
  let v = (raw || '').trim().replace(/\/$/, '');
  if (!v) return v;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `http://${v}`;
  return v.replace(/\/$/, '');
}

function buildFromIpParts(): string {
  const ip = readEnv('EXPO_PUBLIC_SERVER_IP').trim();
  if (!ip) return '';
  const port = readEnv('EXPO_PUBLIC_SERVER_PORT').trim() || '3000';
  const scheme = readEnv('EXPO_PUBLIC_SERVER_SCHEME').trim() || 'http';
  return normalizeBaseUrl(`${scheme}://${ip}:${port}`);
}

export function getWebBaseUrl(): string {
  const direct = normalizeBaseUrl(readEnv('EXPO_PUBLIC_WEB_URL'));
  const fromParts = buildFromIpParts();

  // A production https URL always wins (Vercel, etc.).
  const isProd = (u: string) =>
    u.startsWith('https://') && !isLocalServerUrl(u);
  if (isProd(direct)) return direct;
  // In dev, explicit IP parts win so the IP lives in ONE line of .env.
  if (fromParts) return fromParts;
  if (direct) {
    if (Platform.OS === 'android' && direct.includes('localhost')) {
      return direct.replace('localhost', '10.0.2.2');
    }
    return direct;
  }
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';
}

/** Generic "is this a dev/LAN address?" — no hardcoded single IP. */
export function isLocalServerUrl(url: string): boolean {
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:]+)/i);
  const host = (m?.[1] || url).toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '10.0.2.2') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host.endsWith('.local')) return true;
  return false;
}

function withHost(url: string, host: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/:]+/i, `$1${host}`);
}

/**
 * Generic emulator / adb-reverse fallbacks derived from whatever host the
 * user configured — no hardcoded 192.168.x.x anywhere.
 */
export function getWebBaseFallbacks(primary: string): string[] {
  const m = primary.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:]+)/i);
  const host = (m?.[1] || '').toLowerCase();
  if (!host) return [];
  const candidates: string[] = [];
  if (host === 'localhost') {
    candidates.push('10.0.2.2', '127.0.0.1');
  } else if (host === '10.0.2.2') {
    candidates.push('localhost', '127.0.0.1');
  } else if (host === '127.0.0.1') {
    candidates.push('10.0.2.2', 'localhost');
  } else if (isLocalServerUrl(primary)) {
    // Any LAN IP (192.168.x.x, 10.x, 172.16-31.x, *.local): try emulator +
    // loopback aliases so `adb reverse` setups keep working.
    candidates.push('10.0.2.2', 'localhost', '127.0.0.1');
  } else {
    return [];
  }
  return [
    ...new Set(
      candidates
        .map((h) => withHost(primary, h))
        .filter((b) => b && b !== primary)
    ),
  ];
}
