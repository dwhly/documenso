import { FleetVisitorHeader } from './fleet-header';

/**
 * Header for signed-out recipients outside the signing view (complete, expired, rejected...): the Fleet
 * visitor header (shell spec §4), same as the signing page and Send's room pages.
 */
export const RecipientHeader = () => <FleetVisitorHeader />;
