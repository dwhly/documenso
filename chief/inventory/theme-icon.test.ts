// fds v0.10 (owner decision 2026-11-15): the Theme control is a small icon, not a labelled button.
// Sign renders its own icon (React + remix-themes; it does not load the package's theme.js), so these checks pin the
// component itself: Lucide sun / moon / sun-moon, the full label as accessible name and tooltip, a 32px box with a
// 44px tap area, the hover chip only on hover-capable devices, and no words drawn inside the button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const toggle = readFileSync(new URL('../../apps/remix/app/chief/fleet-theme-toggle.tsx', import.meta.url), 'utf8');

test('the Theme control is a sun / moon / sun-moon icon with the full label kept for screen readers and hover', () => {
  assert.match(toggle, /import \{ MoonIcon, SunIcon, SunMoonIcon \} from 'lucide-react';/);
  assert.match(toggle, /choice === 'system' \? SunMoonIcon : choice === 'dark' \? MoonIcon : SunIcon/);
  assert.match(toggle, /aria-label=\{`\$\{label\} \(click to change\)`\}/);
  assert.match(toggle, /title=\{label\}/);
  assert.match(toggle, /h-8 w-8/);
  assert.match(toggle, /after:-inset-1\.5/); // 32px box, no border: -6px on each side = 44px tap area
  assert.match(toggle, /<Icon aria-hidden="true" className="h-\[18px\] w-\[18px\]" \/>/);
  assert.doesNotMatch(toggle, /\{label\}\s*<\/button>/); // the words are no longer drawn
});

test('the Theme icon shows its hover chip only on devices that really hover (no stuck chip after a tap)', () => {
  assert.match(toggle, /\[@media\(hover:hover\)\]:hover:bg-accent/);
  assert.doesNotMatch(toggle, /[\s'"]hover:bg-accent/);
  // the old labelled box (border, padding, text size) must not come back
  assert.doesNotMatch(toggle, /border-input|px-3|text-\[length:var\(--text-sm\)\]/);
});
