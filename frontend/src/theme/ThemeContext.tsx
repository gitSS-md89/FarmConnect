import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';

const LIGHT = {
  surface: '#F9FAF8',
  onSurface: '#1B231E',
  surfaceSecondary: '#FFFFFF',
  surfaceTertiary: '#F0F4EF',
  onSurfaceTertiary: '#2D6A4F',
  brand: '#2D6A4F',
  brandPrimary: '#2D6A4F',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#40916C',
  brandTertiary: '#D8E2DC',
  onBrandTertiary: '#1B4332',
  success: '#2D6A4F',
  warning: '#E07A5F',
  error: '#D90429',
  info: '#40916C',
  border: '#E5EBE7',
  borderStrong: '#A3BCA9',
  divider: '#E5EBE7',
  muted: '#6B7A70',
};

const DARK = {
  surface: '#121614',
  onSurface: '#E8ECE9',
  surfaceSecondary: '#1A201C',
  surfaceTertiary: '#232B26',
  onSurfaceTertiary: '#74C69D',
  brand: '#52B788',
  brandPrimary: '#52B788',
  onBrandPrimary: '#081C15',
  brandSecondary: '#74C69D',
  brandTertiary: '#1B4332',
  onBrandTertiary: '#D8E2DC',
  success: '#52B788',
  warning: '#E07A5F',
  error: '#F55A6F',
  info: '#74C69D',
  border: '#2C3630',
  borderStrong: '#4A5D53',
  divider: '#2C3630',
  muted: '#8A9990',
};

export type ThemeColors = typeof LIGHT;

type ThemeCtx = {
  colors: ThemeColors;
  mode: 'light' | 'dark';
  setMode: (m: 'light' | 'dark') => void;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [mode, setMode] = useState<'light' | 'dark'>(scheme === 'dark' ? 'dark' : 'light');
  useEffect(() => { if (scheme) setMode(scheme === 'dark' ? 'dark' : 'light'); }, [scheme]);
  const colors = mode === 'dark' ? DARK : LIGHT;
  const toggle = useCallback(() => setMode(m => (m === 'dark' ? 'light' : 'dark')), []);
  return <Ctx.Provider value={{ colors, mode, setMode, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ThemeProvider missing');
  return c;
}
