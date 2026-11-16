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

test("the signing page backdrop follows the Fleet surface (cream for a warm tenant), not Documenso's hard-coded gray", () => {
  // Owner, 15 Nov 2026: "the document should still have the cream colors around the edge… the document itself white".
  // Documenso wraps the signer page in `min-h-screen w-screen bg-gray-50`; the PDF page stays white on top of it.
  assert.match(css, /\.min-h-screen\.w-screen\.bg-gray-50:has\(> \.fleet-signer-chrome\)\s*\{\s*background-color: hsl\(var\(--background\)\);\s*\}/);
});

test('the Theme control is a small sun / moon icon with the full label kept for screen readers and hover', () => {
  // Owner, 15 Nov 2026: "really just an icon like a moon or a sun". Same cycle (auto -> light -> dark) as fds theme.js.
  const toggle = readFileSync(new URL('../../apps/remix/app/chief/fleet-theme-toggle.tsx', import.meta.url), 'utf8');
  assert.match(toggle, /import \{ MoonIcon, SunIcon, SunMoonIcon \} from 'lucide-react';/);
  assert.match(toggle, /choice === 'system' \? SunMoonIcon : choice === 'dark' \? MoonIcon : SunIcon/);
  assert.match(toggle, /aria-label=\{`\$\{label\} \(click to change\)`\}/);
  assert.match(toggle, /title=\{label\}/);
  assert.match(toggle, /h-8 w-8/);
  assert.match(toggle, /after:-inset-1\.5/); // 44px tap area around the 32px icon
  assert.doesNotMatch(toggle, /\{label\}\s*<\/button>/); // the words are no longer drawn
});

test('the Theme icon only shows its hover chip on devices that really hover (no sticky chip after a tap)', () => {
  const toggle = readFileSync(new URL('../../apps/remix/app/chief/fleet-theme-toggle.tsx', import.meta.url), 'utf8');
  assert.match(toggle, /\[@media\(hover:hover\)\]:hover:bg-accent/);
  assert.doesNotMatch(toggle, /[\s'"]hover:bg-accent/);
});
