import type { RecipientStatusType } from '@documenso/lib/client-only/recipient-type';
import { cn } from '@documenso/ui/lib/utils';
import { Avatar, AvatarFallback } from '@documenso/ui/primitives/avatar';

const ZIndexes: { [key: string]: string } = {
  '10': 'z-10',
  '20': 'z-20',
  '30': 'z-30',
  '40': 'z-40',
  '50': 'z-50',
};

export type StackAvatarProps = {
  first?: boolean;
  zIndex?: string;
  fallbackText?: string;
  type: RecipientStatusType;
  className?: string;
};

export const StackAvatar = ({ first, zIndex, fallbackText = '', className }: StackAvatarProps) => {
  let zIndexClass = '';
  const firstClass = first ? '' : '-ml-3';

  if (zIndex) {
    zIndexClass = ZIndexes[zIndex] ?? '';
  }

  // Shell §7: recipients are people, so their avatars are neutral; status lives in the Status pill.
  const classes = 'bg-secondary text-secondary-foreground';

  return (
    <Avatar
      className={cn(
        zIndexClass,
        firstClass,
        'h-10 w-10 border-2 border-background border-solid',
        className,
      )}
    >
      <AvatarFallback className={classes}>{fallbackText}</AvatarFallback>
    </Avatar>
  );
};
