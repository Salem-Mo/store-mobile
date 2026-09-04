// Expo dynamic config — makes `.env` the ONLY place for the server IP/URL.
//
// How it works: Expo CLI loads `.env` before evaluating this file, and EAS
// passes Secrets as `process.env` at build time. We copy those values into
// `expo.extra` so `Constants.expoConfig.extra` always mirrors `.env`.
// Never hardcode an IP/URL here — change `.env` → `EXPO_PUBLIC_WEB_URL` only.
//
// NOTE: `app.json` stays as the static base (icons, splash, permissions).
// This file extends it; if a value exists in both, the `.env` one wins.

/* eslint-disable @typescript-eslint/no-require-imports */
try {
  // Belt & suspenders: ensure `.env` is loaded even if Expo hasn't yet.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
} catch {
  // `dotenv` is a transitive dep of expo; if missing, Expo already loaded .env.
}

const appJson = require('./app.json');

const pick = (...keys) => {
  for (const k of keys) {
    const v = (process.env[k] || '').trim();
    if (v) return v;
  }
  return undefined;
};

module.exports = ({ config }) => {
  const base = { ...(appJson.expo || {}), ...(config?.expo || {}), ...config };
  const baseExtra = { ...((appJson.expo || {}).extra || {}), ...(base.extra || {}) };

  // .env wins; app.json values survive only as a local fallback.
  const extra = {
    ...baseExtra,
    EXPO_PUBLIC_SUPABASE_URL:
      pick('EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL') ||
      baseExtra.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY:
      pick(
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY'
      ) || baseExtra.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_WEB_URL:
      pick('EXPO_PUBLIC_WEB_URL') || baseExtra.EXPO_PUBLIC_WEB_URL,
    EXPO_PUBLIC_SERVER_IP:
      pick('EXPO_PUBLIC_SERVER_IP') || baseExtra.EXPO_PUBLIC_SERVER_IP,
    EXPO_PUBLIC_SERVER_PORT:
      pick('EXPO_PUBLIC_SERVER_PORT') || baseExtra.EXPO_PUBLIC_SERVER_PORT,
  };

  // Drop undefined keys so stale app.json values can't shadow a cleared env.
  for (const k of Object.keys(extra)) {
    if (extra[k] === undefined) delete extra[k];
  }

  return { ...base, extra };
};
