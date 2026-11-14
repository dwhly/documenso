import { cn } from '@documenso/ui/lib/utils';
import { useEffect, useState } from 'react';
import { Theme, useTheme } from 'remix-themes';

import { isSystemTheme, themeLabel } from './fleet-theme-contract';

type ThemeChoice = 'system' | 'light' | 'dark';

const NEXT_CHOICE: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

export type FleetThemeToggleProps = {
  className?: string;
};

/**
 * The fds labelled Theme button (DESIGN.md §6): always last at the far right of a header, cycling
 * auto -> light -> dark like fds theme.js. remix-themes stays the store (cookie + SSR, no flash).
 * System mode reads "Theme: auto (light|dark)" with the resolved scheme (fds v0.9). The server can't know the OS
 * preference, so the first client render repeats the server's "Theme: auto" and the resolved label follows on mount.
 */
export const FleetThemeToggle = ({ className }: FleetThemeToggleProps) => {
  const [theme, setTheme, { definedBy }] = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const choice: ThemeChoice = isSystemTheme(theme, definedBy) ? 'system' : theme === Theme.DARK ? 'dark' : 'light';
  const label = themeLabel(mounted || choice !== 'system' ? theme : null, definedBy);

  const onClick = () => {
    const next = NEXT_CHOICE[choice];

    setTheme(next === 'system' ? null : next === 'dark' ? Theme.DARK : Theme.LIGHT);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (click to change)`}
      data-fds-theme-toggle=""
      suppressHydrationWarning
      className={cn(
        'inline-flex h-8 flex-shrink-0 items-center whitespace-nowrap rounded-control border border-input bg-background px-3 font-medium text-foreground text-[length:var(--text-sm)] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {label}
    </button>
  );
};
