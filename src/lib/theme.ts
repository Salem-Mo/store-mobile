/**
 * Design system — mirrors web `static/index.html` but tuned for mobile.
 * Primary: #14213d (navy), Accent: #0f9d78/#16b98d (emerald), Danger: #d94f5c
 */
export const colors = {
  primary: '#14213d',
  primarySoft: '#20345d',
  accent: '#0f9d78',
  accent2: '#16b98d',
  danger: '#d94f5c',
  dangerSoft: '#ef6972',
  bg: '#f3f6fa',
  card: '#ffffff',
  ink: '#172033',
  muted: '#718096',
  line: '#e5eaf1',
  successBg: '#e6f7f0',
  warningBg: '#fff4e5',
  errorBg: '#fde8e8',
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const shadows = {
  card: {
    shadowColor: '#14213d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHover: {
    shadowColor: '#14213d',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.11,
    shadowRadius: 30,
    elevation: 6,
  },
} as const;

// 48px+ touch targets — thumb zone
export const touch = {
  minH: 48,
  minW: 48,
} as const;
