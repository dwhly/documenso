// C4a: one design system across the signer journey (owner, 15 Nov 2026).
// 1. The app is "Sign" while signing (Sign's visitor header) and "Dealroom" once you're in the room (Send's copy page).
// 2. Buttons use the Fleet type: DESIGN.md "fds-btn" = --text-sm (13px) / 600. Documenso's Button primitive is
//    text-sm (14px) / font-medium (500), so the font audit showed Sign's buttons drifting from Send's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const chief = new URL('../../apps/remix/app/chief/', import.meta.url);
const header = readFileSync(new URL('fleet-header.tsx', chief), 'utf8');
const css = readFileSync(new URL('fleet-documenso.css', chief), 'utf8');
const button = readFileSync(new URL('../../packages/ui/primitives/button.tsx', import.meta.url), 'utf8');

test('the visitor header (signing pages) names the app Sign', () => {
  const visitor = header.slice(header.indexOf('export const FleetVisitorHeader'));
  assert.match(visitor.slice(0, visitor.indexOf('</header>')), /<FleetLockup product="Sign" \/>/);
});

test("Documenso's button primitive still carries the classes the Fleet type rule targets", () => {
  assert.match(button, /'inline-flex items-center justify-center rounded-md text-sm font-medium /);
});

test('Sign buttons use the Fleet button type (13px / 600), like fds-btn on Send', () => {
  assert.match(css, /\.inline-flex\.rounded-md\.text-sm\.font-medium:not\(\.fleet-page-head__actions \*\)\s*\{\s*font-size: var\(--text-sm\);\s*font-weight: 600;\s*\}/);
  // The shell spec's page-head actions stay 14px (they match Send's .dr-pagehead actions).
  assert.match(css, /\.fleet-page-head__actions button \{[^}]*font-size: var\(--text-md\);/);
});
