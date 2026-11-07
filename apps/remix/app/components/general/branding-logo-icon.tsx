import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

/** Fleet mark (fleet-design-system marks/fleet.svg). Colour comes from --brand. */
export const BrandingLogoIcon = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="Fleet" {...props}>
      <g style={{ fill: 'hsl(var(--brand))' }}>
        <path d="M12 2.5 16.2 10.4 12 8.6 7.8 10.4Z" />
        <path d="M6 10.5 10.2 18.4 6 16.6 1.8 18.4Z" opacity=".8" />
        <path d="M18 10.5 22.2 18.4 18 16.6 13.8 18.4Z" opacity=".8" />
      </g>
    </svg>
  );
};
