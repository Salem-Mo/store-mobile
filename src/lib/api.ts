/**
 * API client — talks to the existing Next.js backend.
 * Keeps the web's security model: PIN-hashed workers, rate-limited,
 * atomic checkout RPC. Mobile reuses the same endpoints.
 *
 * Configure WEB_URL in .env (e.g. https://your-vercel.app)
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getWebBase(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extra = ((Constants.expoConfig as any)?.extra || (Constants.manifest as any)?.extra || {}) as Record<string, string>;
  const fromExtra = extra.EXPO_PUBLIC_WEB_URL || extra.WEB_URL || extra.EXPO_PUBLIC_SUPABASE_URL && '';
  const fromProcess =
    (typeof process !== 'undefined' && (process.env as Record<string, string>).EXPO_PUBLIC_WEB_URL) || ''
  const raw = (fromExtra || fromProcess || 'http://localhost:3000').trim();
  if (Platform.OS === 'android' && raw.includes('localhost')) {
    return raw.replace('localhost', '10.0.2.2');
  }
  return raw.replace(/\/$/, '');
}

// Fallback candidates when primary host times out (covers firewall/emulator + adb reverse)
function getWebBaseFallbacks(primary: string): string[] {
  const fallbacks: string[] = [];
  if (primary.includes('192.168.1.8')) {
    fallbacks.push(primary.replace('192.168.1.8', '10.0.2.2'));
    fallbacks.push(primary.replace('192.168.1.8', '127.0.0.1'));
  }
  if (primary.includes('10.0.2.2')) {
    fallbacks.push(primary.replace('10.0.2.2', '192.168.1.8'));
    fallbacks.push(primary.replace('10.0.2.2', '127.0.0.1'));
  }
  if (primary.includes('localhost') || primary.includes('127.0.0.1')) {
    fallbacks.push(primary.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2'));
    fallbacks.push(primary.replace(/localhost|127\.0\.0\.1/g, '192.168.1.8'));
  }
  return [...new Set(fallbacks.filter((b) => b !== primary))];
}

export type ApiUser = {
  id?: string;
  username: string;
  display_name: string;
  role: 'admin' | 'worker';
  permissions: string[];
};

let authToken: string | null = null;

export function setAuthToken(t: string | null) {
  authToken = t;
}
export function getAuthToken() {
  return authToken;
}
export function getWebBaseUrl() {
  return getWebBase();
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (authToken && authToken !== 'owner-session') h.Authorization = `Bearer ${authToken}`;
  return h;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const bases = [getWebBase(), ...getWebBaseFallbacks(getWebBase())];
  let lastErr: unknown = null;
  for (const base of bases) {
    const url = `${base}${path}`;
    let res: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      res = await fetch(url, { ...init, signal: controller.signal } as RequestInit);
      clearTimeout(timeout);
      const text = await res.text().catch(() => '');
      let data: T & { error?: string } = {} as never;
      try {
        data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
      } catch {
        data = {} as T & { error?: string };
      }
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error || `Request failed ${res.status} @ ${url}${text ? ` — ${text.slice(0, 200)}` : ''}`;
        throw new Error(errMsg);
      }
      // Success — remember working base for next calls is not needed (getWebBase is deterministic)
      return data as T;
    } catch (e: unknown) {
      clearTimeout(timeout);
      lastErr = e;
      const isAbort = e instanceof Error && (e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted'));
      const isNetwork = e instanceof Error && (e.message?.toLowerCase().includes('network') || e.message?.toLowerCase().includes('failed') || String(e).includes('Network'));
      // Only retry on timeout/network, not on 4xx/5xx (those throw above with res.ok check)
      if (isAbort || isNetwork || String(e).includes('لا يمكن الوصول')) {
        // If we have more fallbacks, try next base silently
        if (base !== bases[bases.length - 1]) {
          console.warn(`[api] ${base} unreachable, trying fallback...`, (e as Error).message);
          continue;
        }
      }
      // Final base failed — throw user-friendly message
      const primary = getWebBase();
      const tried = bases.join(', ');
      const isAbortFinal = isAbort;
      throw new Error(
        isAbortFinal
          ? `انتهت المهلة — السيرفر لا يرد ${primary} (8s). جرب البدلاء: ${tried}. تأكد من: 1) npx next dev --hostname 0.0.0.0 2) adb reverse tcp:3000 tcp:3000 3) فتح جدار الحماية لمنفذ 3000`
          : `Network request failed — لا يمكن الوصول للسيرفر ${primary}. جرب: ${tried}. تأكد أن الموبايل والكمبيوتر على نفس الواي فاي وأن السيرفر يعمل: npx next dev --hostname 0.0.0.0  أو استخدم adb reverse tcp:3000 tcp:3000`
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// --- Auth ---
export async function loginWorker(username: string, pin: string) {
  const data = await jsonFetch<{ ok: boolean; user: ApiUser; access_token?: string }>('/api/worker-auth', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username, password: pin, action: 'login' }),
  });
  if (data.access_token) setAuthToken(data.access_token);
  return data;
}

export async function loginOwner(pin: string) {
  const data = await jsonFetch<{ ok: boolean; user: ApiUser }>('/api/worker-auth', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ownerPin: pin, action: 'owner-login' }),
  });
  return data;
}

export async function fetchCanSignup(): Promise<{ canSignup: boolean; hasAccounts: boolean; count: number }> {
  const data = await jsonFetch<{ canSignup: boolean; hasAccounts: boolean; count: number; allowed?: boolean }>('/api/worker-auth', {
    method: 'GET',
    headers: headers(),
  });
  // normalize: server may return allowed alias
  const can = !!(data.canSignup ?? data.allowed);
  return { canSignup: can, hasAccounts: !!data.hasAccounts || !can, count: data.count ?? (can ? 0 : 1) };
}

export async function signupAdmin(username: string, pin: string) {
  const data = await jsonFetch<{ ok: boolean; user: ApiUser; access_token?: string; refresh_token?: string }>('/api/worker-auth', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username, password: pin, action: 'signup' }),
  });
  if (data.access_token) setAuthToken(data.access_token);
  return data;
}

// --- Products ---
export async function fetchProducts() {
  const data = await jsonFetch<{ products: import('./types').Product[] }>('/api/products', {
    headers: headers(),
  });
  return data.products;
}

export async function upsertProduct(p: {
  id?: string;
  name: string;
  barcode: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  type: 'piece' | 'weight';
}) {
  return jsonFetch<{ ok: boolean; id?: string }>('/api/products', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      buyPrice: p.buyPrice,
      sellPrice: p.sellPrice,
      qty: p.qty,
      type: p.type,
    }),
  });
}

// --- Checkout ---
export async function checkout(total: number, items: unknown[]) {
  return jsonFetch<{ ok: boolean; saleId?: string; sale_id?: string; total?: number }>('/api/checkout', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ total, items }),
  });
}

// --- Expenses & Shift ---
export async function fetchExpenses() {
  return jsonFetch<{ expenses: import('./types').ExpenseRow[] }>('/api/expenses', {
    headers: headers(),
  });
}
export async function addExpenseApi(reason: string, amount: number) {
  return jsonFetch<{ ok: boolean }>('/api/expenses', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ reason, amount }),
  });
}
export async function fetchShiftReport() {
  // server computes from shift_closings — matches web's buildShiftReportData
  return jsonFetch<{
    totalSales: number;
    expenses: number;
    cash: number;
    net: number;
    invoices?: number;
    text?: string;
    ownerWhatsapp?: string;
    since?: string;
  }>('/api/shift', { headers: headers() });
}
export async function closeShift(payload: { cash_total?: number; notes?: string }) {
  return jsonFetch<{ ok: boolean }>('/api/shift', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
}

// --- Workers ---
export type WorkerRow = {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'worker';
  permissions: string[];
  active: boolean;
  created_at?: string;
};

export const PERM_DEFS: { key: string; label: string; desc: string }[] = [
  { key: 'pos', label: 'البيع (POS)', desc: 'تشغيل نقطة البيع والكاشير' },
  { key: 'weights', label: 'الأوزان', desc: 'بيع بالوزن / كجم' },
  { key: 'expenses', label: 'المصروفات', desc: 'تسجيل وعرض المصروفات' },
  { key: 'shift', label: 'تقفيل الشيفت', desc: 'إغلاق ومعاينة تقرير الشيفت' },
  { key: 'add_inv', label: 'إضافة أصناف', desc: 'إضافة منتجات جديدة للمخزن' },
  { key: 'edit_inv', label: 'تعديل أصناف', desc: 'تعديل بيانات وأسعار المخزن' },
  { key: 'delete_cart', label: 'حذف من السلة', desc: 'حذف أصناف من سلة البيع' },
  { key: 'reports', label: 'التقارير', desc: 'عرض التقارير والإحصائيات' },
];

export const ROLE_PRESETS: { id: string; label: string; perms: string[] }[] = [
  { id: 'cashier', label: 'كاشير', perms: ['pos', 'weights', 'delete_cart'] },
  { id: 'store', label: 'أمين مخزن', perms: ['add_inv', 'edit_inv'] },
  { id: 'accountant', label: 'محاسب', perms: ['reports', 'shift', 'expenses'] },
  { id: 'full', label: 'صلاحيات كاملة', perms: ['pos', 'weights', 'expenses', 'shift', 'add_inv', 'edit_inv', 'delete_cart', 'reports'] },
];

export async function fetchWorkers(): Promise<WorkerRow[]> {
  // Primary: dedicated /api/workers (admin only)
  try {
    const data = await jsonFetch<{ workers: WorkerRow[] }>('/api/workers', { headers: headers() });
    return data.workers || [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If 403 -> not admin, return empty and let caller handle permission UI
    if (msg.includes('صلاحية') || msg.includes('403')) throw e;
    // Fallback: try Supabase direct (helps when backend route not yet deployed)
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const sb = getSupabase();
      // Use anon client with Bearer token via authenticated fetch using supabase-js auth header override
      // We create a fetch-override by setting Authorization globally via Supabase client
      // For simplicity, use plain fetch to Supabase REST with Bearer
      if (!authToken || authToken === 'owner-session') throw new Error('no token for supabase fallback');
      // We can't cleanly use supabase-js with custom token without setSession; try REST directly
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('@/lib/supabase');
      const url = `${SUPABASE_URL}/rest/v1/users?select=id,username,display_name,role,permissions,active,created_at&order=created_at.desc&role=eq.worker`;
      const r = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!r.ok) throw new Error(`supabase fallback ${r.status}`);
      const j = (await r.json()) as WorkerRow[];
      return j || [];
    } catch {
      // re-throw original
      throw e;
    }
  }
}

export async function createWorker(payload: { username: string; pin: string; permissions: string[]; active?: boolean }) {
  return jsonFetch<{ ok: boolean; user?: ApiUser }>('/api/worker-auth', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'create', username: payload.username, password: payload.pin, permissions: payload.permissions, active: payload.active ?? true }),
  });
}

export async function updateWorker(
  id: string,
  payload: { username: string; pin?: string; permissions: string[]; active: boolean }
) {
  const body: Record<string, unknown> = { action: 'update', id, username: payload.username, permissions: payload.permissions, active: payload.active };
  if (payload.pin && payload.pin.trim().length > 0) body.password = payload.pin.trim();
  return jsonFetch<{ ok: boolean }>('/api/worker-auth', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
}

export async function deleteWorker(id: string) {
  return jsonFetch<{ ok: boolean }>('/api/worker-auth', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ action: 'delete', id }),
  });
}

// --- Config / owner whatsapp ---
export async function fetchConfig() {
  // Prefer authenticated settings, then shift report, then raw config
  // /api/config exposes Supabase keys publicly and never returns ownerWhatsapp,
  // so we resolve whatsapp via the protected settings/shift endpoints.
  try {
    const s = await jsonFetch<{ settings: Record<string, unknown> }>('/api/settings', { headers: headers() });
    const v = s.settings?.owner_whatsapp as { number?: string } | undefined;
    if (v?.number) return { ownerWhatsapp: v.number };
    // fallback shape where settings may be directly { value: { number }}
    const alt = (s.settings as Record<string, unknown>)?.owner_whatsapp as unknown;
    if (typeof alt === 'string') return { ownerWhatsapp: alt };
  } catch {}
  try {
    const sh = await fetchShiftReport();
    if (sh.ownerWhatsapp) return { ownerWhatsapp: sh.ownerWhatsapp };
  } catch {}
  try {
    const raw = await jsonFetch<{ ownerWhatsapp?: string; number?: string; whatsapp?: string }>('/api/config', { headers: headers() });
    if (raw.ownerWhatsapp) return raw;
    if ((raw as { number?: string }).number) return { ownerWhatsapp: (raw as { number?: string }).number as string };
  } catch {}
  return { ownerWhatsapp: '' };
}

export async function fetchOwnerWhatsapp(): Promise<string> {
  const c = await fetchConfig();
  return c.ownerWhatsapp || '';
}

export async function updateOwnerWhatsapp(number: string): Promise<{ ok: boolean; number: string }> {
  const digits = number.replace(/\D/g, '');
  return jsonFetch<{ ok: boolean; number: string }>('/api/settings', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ key: 'owner_whatsapp', number: digits }),
  });
}
