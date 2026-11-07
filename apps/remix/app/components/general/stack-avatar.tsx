import { RecipientStatusType } from '@documenso/lib/client-only/recipient-type';
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

export const StackAvatar = ({ first, zIndex, fallbackText = '', type, className }: StackAvatarProps) => {
  let classes = '';
  let zIndexClass = '';
  const firstClass = first ? '' : '-ml-3';

  if (zIndex) {
    zIndexClass = ZIndexes[zIndex] ?? '';
  }

  // Fleet design system status roles: opened = info (in progress), unsigned and waiting = neutral.
  switch (type) {
    case RecipientStatusType.UNSIGNED:
      classes = 'bg-neutral-subtle text-neutral';
      break;
    case RecipientStatusType.OPENED:
      classes = 'bg-info-subtle text-info';
      break;
    case RecipientStatusType.WAITING:
      classes = 'bg-neutral-subtle text-neutral';
      break;
    case RecipientStatusType.COMPLETED:
      classes = 'bg-success-subtle text-success';
      break;
    case RecipientStatusType.REJECTED:
      classes = 'bg-danger-subtle text-danger';
      break;
    default:
      break;
  }

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
