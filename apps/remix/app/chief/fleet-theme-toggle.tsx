import { cn } from '@documenso/ui/lib/utils';
import { MoonIcon, SunIcon, SunMoonIcon } from 'lucide-react';
import React, { useEffect } from 'react';
import { Theme, useTheme } from 'remix-themes';

import { isSystemTheme, themeLabel } from './fleet-theme-contract';

type ThemeChoice = 'system' | 'light' | 'dark';

const NEXT_CHOICE: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

export type FleetThemeToggleProps = {
  className?: string;
};

/**
 * The fds Theme control, always last at the far right of a header. Owner (15 Nov 2026): a small icon, not a
 * labelled button: sun / moon / sun-moon for light / dark / auto, with the full label as its accessible name and
 * tooltip, and a 44px tap area around the 32px icon (proposed upstream as fds DESIGN.md §6). It cycles
 * auto -> light -> dark like fds theme.js. remix-themes stays the store (cookie + SSR, no flash).
 * System mode reads "Theme: auto (light|dark)" with the resolved scheme (fds v0.9). The server can't know the OS
 * preference, so the first client render repeats the server's "Theme: auto" and the resolved label follows on mount.
 */
export const FleetThemeToggle = ({ className }: FleetThemeToggleProps) => {
  const [theme, setTheme, { definedBy }] = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState('');

  useEffect(() => setMounted(true), []);

  const choice: ThemeChoice = isSystemTheme(theme, definedBy) ? 'system' : theme === Theme.DARK ? 'dark' : 'light';
  const label = themeLabel(mounted || choice !== 'system' ? theme : null, definedBy);

  const Icon = choice === 'system' ? SunMoonIcon : choice === 'dark' ? MoonIcon : SunIcon;

  const onClick = () => {
    const next = NEXT_CHOICE[choice];

    setTheme(next === 'system' ? null : next === 'dark' ? Theme.DARK : Theme.LIGHT);
    const resolved =
      next === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? Theme.DARK : Theme.LIGHT) : next;
    setAnnouncement(themeLabel(resolved, next === 'system' ? 'SYSTEM' : 'USER'));
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} (click to change)`}
        title={label}
        data-fds-theme-toggle=""
        suppressHydrationWarning
        className={cn(
          'relative inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-control text-current transition-colors after:absolute after:-inset-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(hover:hover)]:hover:bg-accent',
          className,
        )}
      >
        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </>
  );
};
