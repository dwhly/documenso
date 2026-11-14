import { useTheme } from 'remix-themes';

import { colorSchemeContent, FLEET_THEME_BOOT } from './fleet-theme-contract';

export type FleetThemeHeadProps = {
  /** True when the server rendered a saved (cookie) choice, so no boot script is needed. */
  ssrTheme: boolean;
  nonce?: string;
};

/** Replaces remix-themes' `PreventFlashOnWrongTheme`: ONE authoritative colour-scheme meta + the boot script. */
export const FleetThemeHead = ({ ssrTheme, nonce }: FleetThemeHeadProps) => {
  const [theme, , { definedBy }] = useTheme();

  return (
    <>
      <meta name="color-scheme" content={colorSchemeContent(theme, definedBy)} />
      {!ssrTheme && (
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FLEET_THEME_BOOT }} />
      )}
    </>
  );
};
