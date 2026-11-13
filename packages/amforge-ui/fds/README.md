# Vendored fleet-design-system

Source: `dwhly/fleet-design-system` **v0.9.2** (commit `f81d06e`), copied with `scripts/vendor.sh` (which never copies the
prototype-only `fds-lab.js`). `fds.lock` pins the version, commit and a sha256 per vendored file; verify with
`scripts/check-vendored.sh packages/amforge-ui/fds` from the package. Do not edit vendored files here: change the system
upstream, bump its version, re-vendor.

Used: `fonts.css` + `fonts/`, `tokens.css`, `components.css` (imported by `apps/remix/app/app.css`), `tailwind.preset.cjs`
(`packages/tailwind-config/index.cjs`), `marks/fleet.svg`. Vendored but not loaded: `theme.js` and `theme-boot.js` (Sign keeps `remix-themes`,
cookie-backed SSR with no flash, which writes `data-theme` on `<html>` and renders the `<meta name="color-scheme">` before its boot script, kept in step with the
theme; `~/chief/fleet-theme-toggle.tsx` gives it the fds
labelled toggle and cycle). Vendored with `--brands none` (recorded in `fds.lock`): Fleet Dealroom loads no brand layer.

`apps/remix/app/root.tsx` writes `<html data-edge="outline" data-density="spacious">` statically (DESIGN.md §10).
Documenso-only variables are mapped onto token roles in `apps/remix/app/chief/fleet-documenso.css`.
