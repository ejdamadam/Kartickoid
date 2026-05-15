import React, { createContext, useContext, useEffect, useState } from 'react';

export interface Theme {
  name: string;
  primary: string;
  bg: string;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const defaultTheme = { name: 'Classic', primary: '#26312d', bg: '#f7f5ef' };

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    return saved ? JSON.parse(saved) : defaultTheme;
  });

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('app-theme', JSON.stringify(newTheme));
    setThemeState(newTheme);
  };

  useEffect(() => {
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    };

    document.documentElement.style.setProperty('--primary-color', theme.primary);
    document.documentElement.style.setProperty('--primary-rgb', hexToRgb(theme.primary));
    document.documentElement.style.setProperty('--bg-color', theme.bg);
    document.documentElement.style.setProperty('--bg-rgb', hexToRgb(theme.bg));
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
