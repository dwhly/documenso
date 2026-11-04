import { communityLimits } from './constants';
export const getServerLimits = async (_options: { userId: number; teamId: number }) => communityLimits;
