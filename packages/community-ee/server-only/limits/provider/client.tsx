import type { ReactNode } from 'react';
import { communityLimits } from '../constants';
import type { TLimitsResponseSchema } from '../schema';
export type LimitsContextValue = TLimitsResponseSchema & { refreshLimits: () => Promise<void> };
export type LimitsProviderProps = { initialValue?: TLimitsResponseSchema; disableLimitsFetch?: boolean; teamId: number; children?: ReactNode };
const value: LimitsContextValue = { ...communityLimits, refreshLimits: async () => {} };
export const useLimits = (): LimitsContextValue => value;
export const LimitsProvider = ({ children }: LimitsProviderProps) => <>{children}</>;
