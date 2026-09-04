import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

function getEnv(key: string): string | undefined {
  // Single source: .env (process.env) wins; app.config.js injects the same
  // values into expo extra at build time as a fallback (never hardcode here).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extra = (Constants.expoConfig?.extra as any) || {};
  return (
    process.env[key] ||
    extra[key] ||
    (Constants.manifest as unknown as Record<string, unknown>)?.[key] as string | undefined
  );
}

export const SUPABASE_URL =
  getEnv('EXPO_PUBLIC_SUPABASE_URL') ||
  getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  '';

export const SUPABASE_ANON_KEY =
  getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY') ||
  getEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  '';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase env missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (single source of truth).'
    );
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _client;
}
