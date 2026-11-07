import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement> & {
  /** Kept for callers; the Fleet lockup always carries the product word. */
  product?: 'sign' | false;
};

/**
 * "Fleet | Dealroom" as one SVG, for places that size a logo by height (embeds, certificates, signing
 * pages). Same geometry as `.fds-lockup`: 22px mark, 10px gaps, 18px words (700 / 500), 16px rule.
 * Headers use the real `.fds-lockup` (~/chief/fleet-header) instead.
 */
export const BrandingLogo = ({ product: _product, ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 24" role="img" aria-label="Fleet Dealroom" {...props}>
      <g transform="translate(0 1)" style={{ fill: 'hsl(var(--brand))' }}>
        <g transform="scale(0.9167)">
          <path d="M12 2.5 16.2 10.4 12 8.6 7.8 10.4Z" />
          <path d="M6 10.5 10.2 18.4 6 16.6 1.8 18.4Z" opacity=".8" />
          <path d="M18 10.5 22.2 18.4 18 16.6 13.8 18.4Z" opacity=".8" />
        </g>
      </g>
      <text
        x="32"
        y="18.5"
        fill="currentColor"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="18"
        fontWeight="700"
        letterSpacing="-0.18"
      >
        Fleet
      </text>
      <rect x="84" y="4" width="1" height="16" style={{ fill: 'hsl(var(--border))' }} />
      <text
        x="94"
        y="18.5"
        fill="currentColor"
        fillOpacity="0.62"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="18"
        fontWeight="500"
        letterSpacing="-0.18"
      >
        Dealroom
      </text>
    </svg>
  );
};
