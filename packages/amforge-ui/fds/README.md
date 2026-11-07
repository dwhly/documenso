# Vendored fleet-design-system

Source: `dwhly/fleet-design-system` `main` @ `61540c6` (v0.5.1: lockup mark optically centred). Copied verbatim; do not edit here.
Re-vendor by copying `tokens.css`, `fonts.css`, `fonts/`, `components.css`, `tailwind.preset.cjs` and
`marks/fleet.svg` again and updating the commit above. The gated build replaces this copy with the package.

Not vendored: `theme.js`. Sign keeps `remix-themes` (cookie-backed, SSR, no flash), which already writes
`data-theme` on `<html>`; `~/chief/fleet-theme-toggle.tsx` gives it the fds labelled toggle and cycle.

Documenso-only variables are mapped onto token roles in `apps/remix/app/chief/fleet-documenso.css`.

No brand layer: Fleet Dealroom uses the base Fleet tokens (`brands/*.css` is deliberately not vendored).
