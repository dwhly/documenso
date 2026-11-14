# Vendored fleet-design-system

Source: `dwhly/fleet-design-system` **v0.9.5** (commit `38bd9ff`), copied with `scripts/vendor.sh --brands none` (which never
copies the prototype-only `fds-lab.js`). `fds.lock` pins the version, commit, brands and a sha256 per vendored file.
`fds.product` lists the product-owned files allowed in this dir (this README). Verify with `scripts/check-fds-vendored.sh`
(runs the package's `check-vendored.sh packages/fleet-ui/fds --against <package checkout>`; CI runs it in
`.github/workflows/chief-images.yml` before installing or building). Do not edit vendored files here: change the system
upstream, bump its version, re-vendor.

Used: `fonts.css` + `fonts/`, `tokens.css`, `components.css` (imported by `apps/remix/app/app.css`), `tailwind.preset.cjs`
(`packages/tailwind-config/index.cjs`), `marks/fleet.svg`. Vendored but not loaded: `theme.js` and `theme-boot.js` (Sign keeps
`remix-themes`, cookie-backed SSR with no flash, which writes `data-theme` on `<html>`; `~/chief/fleet-theme-toggle.tsx`
gives it the fds labelled toggle and cycle). Vendored with `--brands none` (recorded in `fds.lock`): Fleet Dealroom loads no brand layer.

`apps/remix/app/root.tsx` writes `<html data-edge="outline" data-density="spacious">` statically (DESIGN.md §10).
Documenso-only variables are mapped onto token roles in `apps/remix/app/chief/fleet-documenso.css`.
