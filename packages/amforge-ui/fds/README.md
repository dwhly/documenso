# Vendored fleet-design-system

Source: `dwhly/fleet-design-system` `main` @ `7855f54` (v0.5.0 baseline). Copied verbatim; do not edit here.
Re-vendor by copying `tokens.css`, `fonts.css`, `fonts/`, `components.css`, `tailwind.preset.cjs` and
`brands/amforge.css` again and updating the commit above. The gated build replaces this copy with the package.

Not vendored: `theme.js`. Sign keeps `remix-themes` (cookie-backed, SSR, no flash), which already writes
`data-theme` on `<html>`; `~/chief/fleet-theme-toggle.tsx` gives it the fds labelled toggle and cycle.

Documenso-only variables are mapped onto token roles in `apps/remix/app/chief/fleet-documenso.css`.
