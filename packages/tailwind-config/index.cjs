/* eslint-disable @typescript-eslint/no-var-requires */
const { fontFamily } = require('tailwindcss/defaultTheme');
const { default: flattenColorPalette } = require('tailwindcss/lib/util/flattenColorPalette');

// Documenso's components use raw Tailwind hues with an implied meaning (green = done, red = error...).
// Pointing those palettes at the fds status roles re-skins them centrally, in both modes, without
// editing call sites: 50-100 -> subtle, 200-300 -> border, 400+ -> the text-safe solid.
const role = (name) => {
  const hsl = (v) => `hsl(var(--${v}) / <alpha-value>)`;
  const steps = { 50: 'subtle', 100: 'subtle', 200: 'border', 300: 'border' };

  return Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      hsl(steps[step] ? `${name}-${steps[step]}` : name),
    ]),
  );
};

const STATUS_PALETTES = {
  green: role('success'),
  emerald: role('success'),
  red: role('danger'),
  rose: role('danger'),
  yellow: role('warning'),
  amber: role('warning'),
  orange: role('warning'),
  blue: role('info'),
  sky: role('info'),
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Fleet design system preset (vendored in packages/amforge-ui/fds). Dark mode keys off the tokens'
  // `data-theme`, so Documenso's `.dark` palette in theme.css never activates.
  presets: [require('../amforge-ui/fds/tailwind.preset.cjs')],
  darkMode: ['variant', '&:is([data-theme="dark"]:not(.dark-mode-disabled) *)'],
  content: ['src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...fontFamily.sans],
        signature: ['var(--font-signature)'],
        noto: ['var(--font-noto)'],
      },
      zIndex: {
        9999: '9999',
      },
      aspectRatio: {
        'signature-pad': '16 / 7',
      },
      colors: {
        ...STATUS_PALETTES,
        // fds selected state (active step, selected file): neutral, never brand or status.
        selected: {
          DEFAULT: 'hsl(var(--selected) / <alpha-value>)',
          foreground: 'hsl(var(--selected-foreground) / <alpha-value>)',
          border: 'hsl(var(--selected-border) / <alpha-value>)',
        },
        border: 'hsl(var(--border))',
        'field-border': 'hsl(var(--field-border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        'envelope-editor-background': 'hsl(var(--envelope-editor-background))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'field-card': {
          DEFAULT: 'hsl(var(--field-card))',
          border: 'hsl(var(--field-card-border))',
          foreground: 'hsl(var(--field-card-foreground))',
        },
        widget: {
          DEFAULT: 'hsl(var(--widget))',
          foreground: 'hsl(var(--widget-foreground))',
        },
        // The `documenso` lime palette maps onto the base Fleet brand roles (no brand layer, no scale):
        // light steps = brand-subtle fills, mid steps = brand, dark steps = brand text on subtle fills.
        documenso: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          50: 'hsl(var(--brand-subtle) / <alpha-value>)',
          100: 'hsl(var(--brand-subtle) / <alpha-value>)',
          200: 'hsl(var(--brand-subtle) / <alpha-value>)',
          300: 'hsl(var(--brand) / <alpha-value>)',
          400: 'hsl(var(--brand) / <alpha-value>)',
          500: 'hsl(var(--brand) / <alpha-value>)',
          600: 'hsl(var(--brand) / <alpha-value>)',
          700: 'hsl(var(--brand-muted-foreground) / <alpha-value>)',
          800: 'hsl(var(--brand-muted-foreground) / <alpha-value>)',
          900: 'hsl(var(--brand-muted-foreground) / <alpha-value>)',
          950: 'hsl(var(--brand-muted-foreground) / <alpha-value>)',
        },
        recipient: {
          green: 'hsl(var(--recipient-green))',
          blue: 'hsl(var(--recipient-blue))',
          purple: 'hsl(var(--recipient-purple))',
          orange: 'hsl(var(--recipient-orange))',
          yellow: 'hsl(var(--recipient-yellow))',
          pink: 'hsl(var(--recipient-pink))',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        DEFAULT: 'calc(var(--radius) - 3px)',
        '2xl': 'calc(var(--radius) + 4px)',
        xl: 'calc(var(--radius) + 2px)',
        lg: 'var(--radius)',
        // shadcn primitives round controls (buttons, inputs, selects, menu items) with `rounded-md`.
        md: 'var(--radius-control)',
        sm: 'calc(var(--radius-control) * 0.75)',
        control: 'var(--radius-control)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'caret-blink': {
          '0%,70%,100%': { opacity: '1' },
          '20%,50%': { opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'caret-blink': 'caret-blink 1.25s ease-out infinite',
      },
      screens: {
        '3xl': '1920px',
        '4xl': '2560px',
        '5xl': '3840px',
        print: { raw: 'print' },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/container-queries'),
    addVariablesForColors,
  ],
};

function addVariablesForColors({ addBase, theme }) {
  const allColors = flattenColorPalette(theme('colors'));
  const newVars = Object.fromEntries(Object.entries(allColors).map(([key, val]) => [`--${key}`, val]));

  addBase({
    ':root': newVars,
  });
}
