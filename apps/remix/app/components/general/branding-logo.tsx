import type { SVGAttributes } from 'react';

import {
  AMFORGE_MARK,
  AMFORGE_PRODUCTS,
  AMFORGE_VIEWBOX_HEIGHT,
  AMFORGE_VIEWBOX_TOP,
  AMFORGE_WORDMARK,
} from '~/chief/amforge-brand-paths';

export type LogoProps = SVGAttributes<SVGSVGElement> & {
  /**
   * Product name shown after the AmForge wordmark. Outside the app shell (signing pages, embeds,
   * certificates) the lockup carries the product; inside the shell the product switcher does,
   * so the app header passes `product={false}`.
   */
  product?: 'sign' | false;
};

/** AmForge lockup: brand mark + wordmark (+ product). Text is `currentColor`; the mark uses --brand. */
export const BrandingLogo = ({ product = 'sign', ...props }: LogoProps) => {
  const productPath = product ? AMFORGE_PRODUCTS[product] : null;
  const width = productPath ? productPath.width : AMFORGE_WORDMARK.width;
  const label = productPath ? `AmForge ${productPath.label}` : 'AmForge';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 ${AMFORGE_VIEWBOX_TOP} ${width} ${AMFORGE_VIEWBOX_HEIGHT}`}
      role="img"
      aria-label={label}
      {...props}
    >
      <rect
        x={AMFORGE_MARK.x}
        y={AMFORGE_MARK.y}
        width={AMFORGE_MARK.size}
        height={AMFORGE_MARK.size}
        rx={AMFORGE_MARK.rx}
        style={{ fill: 'hsl(var(--brand))' }}
      />
      <path style={{ fill: 'hsl(var(--brand-foreground))' }} d={AMFORGE_MARK.glyph} />
      <path fill="currentColor" d={AMFORGE_WORDMARK.d} />
      {productPath && <path fill="currentColor" fillOpacity={0.6} d={productPath.d} />}
    </svg>
  );
};
