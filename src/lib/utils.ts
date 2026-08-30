export function fmtEGP(n: number): string {
  return `${Number(n || 0).toFixed(2)} ج.م`;
}

export function debounce<T extends (...a: unknown[]) => void>(fn: T, ms = 250): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...a: unknown[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  }) as T;
}

export const SUPPORT_WHATSAPP = '201281338512';
export const SUPPORT_WHATSAPP_DISPLAY = '+20 128 133 8512';

export function waLink(phone: string, text: string): string {
  const p = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function supportWaLink(text = 'مرحبا، أحتاج مساعدة في نظام سوبر ماركت أيوب'): string {
  return waLink(SUPPORT_WHATSAPP, text);
}
