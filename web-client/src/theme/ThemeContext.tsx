import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemePalette {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  identity: string;
  identityText: string;
  accent: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  overlay: string;
  inputBackground: string;
  bubbleMine: string;
  bubbleMineText: string;
  bubbleOther: string;
  bubbleOtherText: string;
}

// Identical palette to the mobile app's src/theme/ThemeContext.tsx — kept in
// sync by hand since this project has no shared package between the two apps.
const DARK: ThemePalette = {
  mode: 'dark',
  background: '#0B132B',
  surface: '#1C2541',
  surfaceAlt: '#141B33',
  border: 'rgba(148,163,184,0.16)',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textFaint: 'rgba(148,163,184,0.5)',
  identity: '#3D63B8',
  identityText: '#F8FAFC',
  accent: '#FF7A00',
  accentText: '#1A0F02',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.14)',
  success: '#38BDF8',
  overlay: 'rgba(6,10,24,0.8)',
  inputBackground: '#141B33',
  bubbleMine: '#25355F',
  bubbleMineText: '#F8FAFC',
  bubbleOther: '#1C2541',
  bubbleOtherText: '#F8FAFC',
};

const LIGHT: ThemePalette = {
  mode: 'light',
  background: '#F0F4F8',
  surface: '#FFFFFF',
  surfaceAlt: '#E2E8F0',
  border: 'rgba(15,23,42,0.1)',
  text: '#0F172A',
  textMuted: '#475569',
  textFaint: 'rgba(71,85,105,0.55)',
  identity: '#2E5AAC',
  identityText: '#FFFFFF',
  accent: '#D95400',
  accentText: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: 'rgba(220,38,38,0.1)',
  warning: '#D97706',
  warningSoft: 'rgba(217,119,6,0.12)',
  success: '#0284C7',
  overlay: 'rgba(15,23,42,0.45)',
  inputBackground: '#E2E8F0',
  bubbleMine: '#DCE8FB',
  bubbleMineText: '#0F172A',
  bubbleOther: '#FFFFFF',
  bubbleOtherText: '#0F172A',
};

const THEME_STORAGE_KEY = 'gizlichat_theme_mode';

interface ThemeContextValue {
  theme: ThemePalette;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: DARK, mode: 'dark', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
    document.body.style.background = mode === 'dark' ? DARK.background : LIGHT.background;
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setModeState(prev => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme: mode === 'dark' ? DARK : LIGHT, mode, toggleTheme }), [mode, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
