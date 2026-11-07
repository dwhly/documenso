import { cn } from '@documenso/ui/lib/utils';
import { Theme, useTheme } from 'remix-themes';

type ThemeChoice = 'system' | 'light' | 'dark';

const NEXT_CHOICE: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

const LABEL: Record<ThemeChoice, string> = {
  system: 'Theme: auto',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

export type FleetThemeToggleProps = {
  className?: string;
};

/**
 * The fds labelled Theme button (DESIGN.md §6): always last at the far right of a header, cycling
 * auto -> light -> dark like fds theme.js. remix-themes stays the store (cookie + SSR, no flash).
 */
export const FleetThemeToggle = ({ className }: FleetThemeToggleProps) => {
  const [theme, setTheme, { definedBy }] = useTheme();

  const choice: ThemeChoice = definedBy === 'SYSTEM' || !theme ? 'system' : theme;

  const onClick = () => {
    const next = NEXT_CHOICE[choice];

    setTheme(next === 'system' ? null : next === 'dark' ? Theme.DARK : Theme.LIGHT);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${LABEL[choice]} (click to change)`}
      data-fds-theme-toggle=""
      suppressHydrationWarning
      className={cn(
        'inline-flex h-8 flex-shrink-0 items-center whitespace-nowrap rounded-control border border-input bg-background px-3 font-medium text-foreground text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {LABEL[choice]}
    </button>
  );
};
