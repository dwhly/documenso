import type { SVGAttributes } from 'react';

import { AMFORGE_MARK } from './amforge-brand-paths';

export type LogoProps = SVGAttributes<SVGSVGElement>;

/** AmForge brand mark (square). Colours come from --brand / --brand-foreground. */
export const BrandingLogoIcon = ({ ...props }: LogoProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 ${AMFORGE_MARK.y} ${AMFORGE_MARK.size} ${AMFORGE_MARK.size}`}
      role="img"
      aria-label="AmForge"
      {...props}
    >
      <rect
        x={0}
        y={AMFORGE_MARK.y}
        width={AMFORGE_MARK.size}
        height={AMFORGE_MARK.size}
        rx={AMFORGE_MARK.rx}
        style={{ fill: 'hsl(var(--brand))' }}
      />
      <path style={{ fill: 'hsl(var(--brand-foreground))' }} d={AMFORGE_MARK.glyph} />
    </svg>
  );
};
