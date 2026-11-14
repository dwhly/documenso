export type ResolvedTheme = 'light' | 'dark' | null | undefined;
export type DefinedBy = 'USER' | 'SYSTEM' | undefined;

/**
 * fds v0.9 theme contract (DESIGN.md §11), on top of remix-themes (cookie + SSR) instead of the package's theme.js:
 * - the colour-scheme meta is `light dark` while the theme follows the system, else the single chosen scheme;
 * - the Theme button reads "Theme: auto (light|dark)" while following the system, else "Theme: light|dark".
 * `theme` is what remix-themes resolved (the OS preference in system mode, null on the server when no cookie is set);
 * `definedBy` says whether the user chose it.
 */
export const isSystemTheme = (theme: ResolvedTheme, definedBy: DefinedBy) => definedBy !== 'USER' || !theme;

export const colorSchemeContent = (theme: ResolvedTheme, definedBy: DefinedBy) =>
  isSystemTheme(theme, definedBy) ? 'light dark' : theme === 'dark' ? 'dark' : 'light';

export const themeLabel = (theme: ResolvedTheme, definedBy: DefinedBy) => {
  if (isSystemTheme(theme, definedBy)) {
    return theme === 'light' || theme === 'dark' ? `Theme: auto (${theme})` : 'Theme: auto';
  }

  return theme === 'dark' ? 'Theme: dark' : 'Theme: light';
};

/**
 * Before paint with no saved choice, fill `data-theme` from the OS preference (the server rendered an empty
 * attribute). The meta keeps `light dark` (system). Same job as remix-themes' boot script, which also rewrote the
 * meta to `dark light`/`light dark` and so never stated a single scheme.
 */
export const FLEET_THEME_BOOT = `(() => {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme');
  if (current !== 'light' && current !== 'dark') {
    root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
})();`;
