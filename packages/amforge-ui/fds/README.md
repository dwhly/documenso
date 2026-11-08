# Vendored fleet-design-system

Source: `dwhly/fleet-design-system` **v0.8.0** (commit `3673538`), copied with `scripts/vendor.sh` (which never copies the
prototype-only `fds-lab.js`). `fds.lock` pins the version, commit and a sha256 per vendored file; verify with
`scripts/check-vendored.sh packages/amforge-ui/fds` from the package. Do not edit vendored files here: change the system
upstream, bump its version, re-vendor.

Used: `fonts.css` + `fonts/`, `tokens.css`, `components.css` (imported by `apps/remix/app/app.css`), `tailwind.preset.cjs`
(`packages/tailwind-config/index.cjs`), `marks/fleet.svg`. Vendored but not loaded: `theme.js` (Sign keeps `remix-themes`,
cookie-backed SSR with no flash, which writes `data-theme` on `<html>`; `~/chief/fleet-theme-toggle.tsx` gives it the fds
labelled toggle and cycle) and `brands/` (Fleet Dealroom uses the base Fleet tokens, no brand layer).

`apps/remix/app/root.tsx` writes `<html data-edge="outline" data-density="spacious">` statically (DESIGN.md §10).
Documenso-only variables are mapped onto token roles in `apps/remix/app/chief/fleet-documenso.css`.
