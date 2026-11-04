/**
 * AmForge shell layout preference (Chief Dealroom layout prototype).
 *
 * `?layout=sidebar|topbar` on any page sets the `amforge_layout` cookie (see server/middleware.ts);
 * the authenticated layout loader reads it, so the shell is chosen during SSR (no hydration flash).
 * Default is the native Documenso top bar.
 */
export const AMFORGE_LAYOUT_COOKIE = 'amforge_layout';

export type AmforgeLayout = 'sidebar' | 'topbar';

export const DEFAULT_AMFORGE_LAYOUT: AmforgeLayout = 'topbar';

export const isAmforgeLayout = (value: unknown): value is AmforgeLayout => value === 'sidebar' || value === 'topbar';

export const resolveAmforgeLayout = (request: Request): AmforgeLayout => {
  const fromQuery = new URL(request.url).searchParams.get('layout');

  if (isAmforgeLayout(fromQuery)) {
    return fromQuery;
  }

  const match = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)amforge_layout=(sidebar|topbar)(?:;|$)/);

  return match ? (match[1] as AmforgeLayout) : DEFAULT_AMFORGE_LAYOUT;
};

/** Client-side: persist the preference and reload so the loader renders the chosen shell. */
export const switchAmforgeLayout = (layout: AmforgeLayout) => {
  document.cookie = `${AMFORGE_LAYOUT_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;

  try {
    localStorage.setItem(AMFORGE_LAYOUT_COOKIE, layout);
  } catch {
    // Ignore (private mode etc.); the cookie is the source of truth.
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('layout');

  window.location.assign(url.toString());
};
