import { useEffect, useState } from 'react';

export type ColorTheme = 'normal' | 'hc1' | 'hc2';

export const THEMES: ColorTheme[] = ['normal', 'hc1', 'hc2'];

export const THEME_LABELS: Record<ColorTheme, string> = {
  normal: '通常',
  hc1: 'カラー調整（橙・青系）',
  hc2: 'ハイコントラスト',
};

const STORAGE_KEY = 'colorTheme';

export function useColorTheme() {
  const [theme, setTheme] = useState<ColorTheme>(
    () => (localStorage.getItem(STORAGE_KEY) as ColorTheme) ?? 'normal',
  );

  useEffect(() => {
    if (theme === 'normal') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) => {
      const idx = THEMES.indexOf(prev);
      return THEMES[(idx + 1) % THEMES.length];
    });
  };

  return { theme, cycleTheme };
}
