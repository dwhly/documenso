export const FLEET_PDF_LOGO_PATH = 'build/client/static/logo.png';

// Seal identity must not inherit legacy tenant/contact URL settings.
export const FLEET_SEAL = {
  reason: 'Signed by Fleet | Dealroom',
  contactInfo: 'Fleet | Dealroom',
  location: 'Fleet | Dealroom',
} as const;
