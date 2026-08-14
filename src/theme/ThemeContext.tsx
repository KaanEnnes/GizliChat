import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

/**
 * Single source of truth for every color used in the app. Blue (background/
 * surface/identity) is the dominant visual identity; `accent` (orange) is
 * reserved for primary calls-to-action only (send, accept call, submit,
 * add-contact) — never for large fills like screens, cards, or message
 * bubbles. Every screen/component should read colors from here via
 * `useTheme()` instead of hardcoding hex values.
 */
export interface ThemePalette {
  mode: ThemeMode;
  /** Screen background. */
  background: string;
  /** Cards, modals, input bars, headers. */
  surface: string;
  /** Secondary elevation: input fields, banners, pressed rows. */
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Brand-identity blue for avatars, unread dots, links, selected states — not a CTA color. */
  identity: string;
  identityText: string;
  /** Primary CTA orange — send/accept/submit/add buttons only. Never a large fill. */
  accent: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  /** Used sparingly for "live/positive" indicators (read ticks, connected dot) — blue-toned, not green. */
  success: string;
  overlay: string;
  inputBackground: string;
  /** Outgoing ("mine") message bubble — identity blue, not orange. */
  bubbleMine: string;
  bubbleMineText: string;
  /** Incoming ("other") message bubble — neutral surface tone. */
  bubbleOther: string;
  bubbleOtherText: string;
  /** Unplayed portion of a voice-message waveform. */
  waveformTrack: string;
}

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
  waveformTrack: 'rgba(248,250,252,0.22)',
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
  waveformTrack: 'rgba(15,23,42,0.18)',
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
