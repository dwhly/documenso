import { createThemeAction } from 'remix-themes';
import { withThemeOriginCheck } from 'server/chief/theme-origin';

import { themeSessionResolver } from '~/storage/theme-session.server';

// Fleet (review r2 [2]): the origin check runs inside the action, so every path that reaches it is covered.
export const action = withThemeOriginCheck(createThemeAction(themeSessionResolver));
