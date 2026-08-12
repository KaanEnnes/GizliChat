import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  overlay: string;
  inputBackground: string;
}

const DARK: ThemePalette = {
  mode: 'dark',
  background: '#12141C',
  surface: '#1C1F2A',
  surfaceAlt: '#1A1D27',
  border: 'rgba(255,255,255,0.08)',
  text: '#F5F5F7',
  textMuted: 'rgba(245,245,247,0.55)',
  textFaint: 'rgba(245,245,247,0.4)',
  accent: '#4D96FF',
  accentText: '#0F1115',
  danger: '#FF6B6B',
  success: '#6BCB77',
  overlay: 'rgba(10,11,15,0.78)',
  inputBackground: '#0F1115',
};

const LIGHT: ThemePalette = {
  mode: 'light',
  background: '#F1F2F6',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EBF2',
  border: 'rgba(15,17,21,0.09)',
  text: '#14161C',
  textMuted: 'rgba(20,22,28,0.6)',
  textFaint: 'rgba(20,22,28,0.42)',
  accent: '#3B7CFF',
  accentText: '#FFFFFF',
  danger: '#D9463F',
  success: '#2FA84F',
  overlay: 'rgba(20,22,28,0.5)',
  inputBackground: '#F1F2F6',
};

const THEME_STORAGE_KEY = 'gizlichat_theme_mode';

interface ThemeContextValue {
  theme: ThemePalette;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DARK,
  mode: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') {
        setModeState(saved);
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState(prev => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: mode === 'dark' ? DARK : LIGHT, mode, toggleTheme }),
    [mode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
