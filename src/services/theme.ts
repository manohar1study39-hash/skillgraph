export type Theme = 'light' | 'dark' | 'system';

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('skillgraph-theme') as Theme;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {}
  return 'light'; // Light mode is default as per design direction
}

export function applyTheme(theme: Theme): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  try {
    localStorage.setItem('skillgraph-theme', theme);
  } catch {}

  return isDark;
}

// Automatically sync with system changes if theme is set to 'system'
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = getInitialTheme();
    if (current === 'system') {
      applyTheme('system');
    }
  });
}
