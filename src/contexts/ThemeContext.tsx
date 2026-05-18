import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../db/database';
import { nowIso } from '../utils/date';

export interface Theme {
  name: string;
  primary: string;
  bg: string;
}

export type TextSize = 'small' | 'default' | 'large' | 'xlarge';
export type ColorMode = 'light' | 'dark';

export interface CustomBackground {
  dataUrl: string;
  name: string;
  updatedAt: string;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  customBackground: CustomBackground | null;
  setCustomBackground: (background: CustomBackground) => Promise<void>;
  clearCustomBackground: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const defaultTheme = { name: 'Classic', primary: '#26312d', bg: '#f7f5ef' };
const textSizePixels: Record<TextSize, string> = {
  small: '15px',
  default: '16px',
  large: '18px',
  xlarge: '20px'
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    return saved ? safeJsonParse(saved, defaultTheme) : defaultTheme;
  });
  const [textSize, setTextSizeState] = useState<TextSize>(() => readSavedTextSize());
  const [colorMode, setColorModeState] = useState<ColorMode>(() => readSavedColorMode());
  const [customBackground, setCustomBackgroundState] = useState<CustomBackground | null>(null);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('app-theme', JSON.stringify(newTheme));
    setThemeState(newTheme);
  };

  const setTextSize = (size: TextSize) => {
    localStorage.setItem('app-text-size', size);
    setTextSizeState(size);
    void db.appMeta.put({ key: 'textSize', value: size, updatedAt: nowIso() });
  };

  const setColorMode = (mode: ColorMode) => {
    localStorage.setItem('app-color-mode', mode);
    setColorModeState(mode);
    void db.appMeta.put({ key: 'colorMode', value: mode, updatedAt: nowIso() });
  };

  const setCustomBackground = async (background: CustomBackground) => {
    await db.appMeta.put({ key: 'customBackground', value: background, updatedAt: nowIso() });
    setCustomBackgroundState(background);
  };

  const clearCustomBackground = async () => {
    await db.appMeta.delete('customBackground');
    setCustomBackgroundState(null);
  };

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      const [storedTextSize, storedColorMode, storedBackground] = await Promise.all([
        db.appMeta.get('textSize'),
        db.appMeta.get('colorMode'),
        db.appMeta.get('customBackground')
      ]);
      if (!active) return;
      if (isTextSize(storedTextSize?.value)) {
        setTextSizeState(storedTextSize.value);
        localStorage.setItem('app-text-size', storedTextSize.value);
      }
      if (isColorMode(storedColorMode?.value)) {
        setColorModeState(storedColorMode.value);
        localStorage.setItem('app-color-mode', storedColorMode.value);
      }
      if (isCustomBackground(storedBackground?.value)) {
        setCustomBackgroundState(storedBackground.value);
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    };

    const palette = colorMode === 'dark'
      ? { primary: '#e8eef8', bg: '#0f172a' }
      : { primary: theme.primary, bg: theme.bg };
    document.documentElement.style.setProperty('--primary-color', palette.primary);
    document.documentElement.style.setProperty('--primary-rgb', hexToRgb(palette.primary));
    document.documentElement.style.setProperty('--bg-color', palette.bg);
    document.documentElement.style.setProperty('--bg-rgb', hexToRgb(palette.bg));
  }, [theme, colorMode]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', textSizePixels[textSize]);
  }, [textSize]);

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
  }, [colorMode]);

  useEffect(() => {
    if (customBackground) {
      document.body.classList.add('has-custom-background');
      document.body.style.setProperty('--custom-background-image', `url("${customBackground.dataUrl}")`);
    } else {
      document.body.classList.remove('has-custom-background');
      document.body.style.removeProperty('--custom-background-image');
    }

    return () => {
      document.body.classList.remove('has-custom-background');
      document.body.style.removeProperty('--custom-background-image');
    };
  }, [customBackground]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, textSize, setTextSize, colorMode, setColorMode, customBackground, setCustomBackground, clearCustomBackground }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readSavedTextSize(): TextSize {
  const saved = localStorage.getItem('app-text-size');
  return isTextSize(saved) ? saved : 'default';
}

function readSavedColorMode(): ColorMode {
  const saved = localStorage.getItem('app-color-mode');
  return isColorMode(saved) ? saved : 'light';
}

function isTextSize(value: unknown): value is TextSize {
  return value === 'small' || value === 'default' || value === 'large' || value === 'xlarge';
}

function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark';
}

function isCustomBackground(value: unknown): value is CustomBackground {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CustomBackground>;
  return typeof candidate.dataUrl === 'string'
    && candidate.dataUrl.startsWith('data:image/')
    && typeof candidate.name === 'string'
    && typeof candidate.updatedAt === 'string';
}
