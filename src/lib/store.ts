import { create } from 'zustand';
import type { CartLine, Product, UserProfile } from './types';
import * as SecureStore from 'expo-secure-store';

type AuthState = {
  user: UserProfile | null;
  token: string | null;
  setAuth: (u: UserProfile | null, t: string | null) => Promise<void>;
  load: () => Promise<void>;
  logout: () => Promise<void>;
};

function isWebFallback() {
  try {
    return typeof localStorage !== 'undefined' && typeof window !== 'undefined';
  } catch {
    return false;
  }
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  setAuth: async (user, token) => {
    set({ user, token });
    if (user && token) {
      try {
        await SecureStore.setItemAsync('ayoub_user', JSON.stringify(user));
      } catch {
        try {
          if (isWebFallback()) localStorage.setItem('ayoub_user', JSON.stringify(user));
        } catch {}
      }
      try {
        await SecureStore.setItemAsync('ayoub_token', token);
      } catch {
        try {
          if (isWebFallback()) localStorage.setItem('ayoub_token', token);
        } catch {}
      }
    } else {
      // clearing handled by logout
    }
  },
  load: async () => {
    let u: string | null = null;
    let t: string | null = null;
    try {
      u = await SecureStore.getItemAsync('ayoub_user');
      t = await SecureStore.getItemAsync('ayoub_token');
    } catch (e) {
      console.warn('[store] SecureStore load failed (web?)', e);
    }
    // Web fallback: SecureStore not available on web — try localStorage
    if ((!u || !t) && isWebFallback()) {
      try {
        if (!u) u = localStorage.getItem('ayoub_user');
        if (!t) t = localStorage.getItem('ayoub_token');
      } catch {}
    }
    if (u && t) {
      try {
        set({ user: JSON.parse(u) as UserProfile, token: t });
      } catch {
        // corrupted persist — clear
        try { await SecureStore.deleteItemAsync('ayoub_user'); } catch {}
        try { await SecureStore.deleteItemAsync('ayoub_token'); } catch {}
        try { if (isWebFallback()) { localStorage.removeItem('ayoub_user'); localStorage.removeItem('ayoub_token'); } } catch {}
      }
    }
  },
  logout: async () => {
    try { await SecureStore.deleteItemAsync('ayoub_user'); } catch {}
    try { await SecureStore.deleteItemAsync('ayoub_token'); } catch {}
    try { if (isWebFallback()) { localStorage.removeItem('ayoub_user'); localStorage.removeItem('ayoub_token'); } } catch {}
    set({ user: null, token: null });
  },
}));

function genLineId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

type CartState = {
  lines: CartLine[];
  addPiece: (p: Product, qty?: number) => void;
  addWeight: (p: Product, grams: number) => void;
  setQty: (idOrBarcode: string, qty: number) => void;
  setQtyById: (id: string, qty: number) => void;
  remove: (idOrBarcode: string) => void;
  removeById: (id: string) => void;
  clear: () => void;
  total: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  addPiece: (p, qty = 1) =>
    set((s) => {
      const idx = s.lines.findIndex((l) => l.barcode === p.barcode && l.unit === 'piece');
      if (idx >= 0) {
        const cur = s.lines[idx];
        const nq = cur.qty + qty;
        const nl: CartLine = { ...cur, qty: nq, lineTotal: +(nq * cur.price).toFixed(2) };
        const copy = [...s.lines];
        copy[idx] = nl;
        return { lines: copy };
      }
      const line: CartLine = {
        id: genLineId(),
        productId: p.id,
        barcode: p.barcode,
        name: p.name,
        price: p.sell_price,
        qty,
        unit: 'piece',
        lineTotal: +(qty * p.sell_price).toFixed(2),
      };
      return { lines: [...s.lines, line] };
    }),
  addWeight: (p, grams) =>
    set((s) => {
      const kg = grams / 1000;
      const lineTotal = +(kg * p.sell_price).toFixed(2);
      // weight lines stack as separate entries (different grams) — each needs its own stable id
      const line: CartLine = {
        id: genLineId(),
        productId: p.id,
        barcode: p.barcode,
        name: `${p.name} — ${grams}g`,
        price: p.sell_price,
        qty: kg,
        grams,
        unit: 'weight',
        lineTotal,
      };
      return { lines: [...s.lines, line] };
    }),
  // Backward compat: barcode variant used elsewhere; if id found use it else barcode
  // New code should prefer setQtyById/removeById for precision (especially weight duplicates)
  setQty: (idOrBarcode, qty) =>
    set((s) => {
      const byId = s.lines.find((l) => l.id === idOrBarcode);
      if (byId) {
        if (qty <= 0) return { lines: s.lines.filter((l) => l.id !== idOrBarcode) };
        return {
          lines: s.lines.map((l) => (l.id === idOrBarcode ? { ...l, qty, lineTotal: +(qty * l.price).toFixed(2) } : l)),
        };
      }
      // Fallback: legacy barcode path — affects all matching barcodes (piece merge behavior)
      if (qty <= 0) return { lines: s.lines.filter((l) => l.barcode !== idOrBarcode) };
      return {
        lines: s.lines.map((l) =>
          l.barcode === idOrBarcode ? { ...l, qty, lineTotal: +(qty * l.price).toFixed(2) } : l
        ),
      };
    }),
  setQtyById: (id, qty) =>
    set((s) => {
      if (qty <= 0) return { lines: s.lines.filter((l) => l.id !== id) };
      return {
        lines: s.lines.map((l) => (l.id === id ? { ...l, qty, lineTotal: +(qty * l.price).toFixed(2) } : l)),
      };
    }),
  remove: (idOrBarcode) =>
    set((s) => {
      if (s.lines.some((l) => l.id === idOrBarcode)) {
        return { lines: s.lines.filter((l) => l.id !== idOrBarcode) };
      }
      // barcode fallback — only for piece; weight lines now isolated by id
      // For backward compat, remove first matching barcode if single piece line exists
      // If multiple weight lines share barcode, remove only the first to avoid nuking all
      const idx = s.lines.findIndex((l) => l.barcode === idOrBarcode);
      if (idx === -1) return s;
      const target = s.lines[idx];
      if (target.unit === 'weight' && s.lines.filter((l) => l.barcode === idOrBarcode && l.unit === 'weight').length > 1) {
        return { lines: s.lines.filter((_, i) => i !== idx) };
      }
      return { lines: s.lines.filter((l) => l.barcode !== idOrBarcode) };
    }),
  removeById: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),
  clear: () => set({ lines: [] }),
  total: () => +get().lines.reduce((a, b) => a + b.lineTotal, 0).toFixed(2),
}));

type UIState = {
  posTab: 'piece' | 'weight';
  setPosTab: (t: 'piece' | 'weight') => void;
};
export const useUI = create<UIState>((set) => ({
  posTab: 'piece',
  setPosTab: (posTab) => set({ posTab }),
}));
