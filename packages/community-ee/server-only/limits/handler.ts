import { communityLimits } from './constants';
export const limitsHandler = async (_request: Request): Promise<Response> => Response.json(communityLimits);
