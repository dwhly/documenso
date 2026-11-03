import { env } from '@documenso/lib/utils/env';
import { cn } from '@documenso/ui/lib/utils';

/**
 * AmForge product switcher (shared shell). Same markup as Send's AmforgeProductSwitcher.jsx and
 * amforge-ui/shell/ProductSwitcher.reference.jsx. Treatment = the Tabs primitive (TabsList /
 * TabsTrigger) at compact size, rendered as links because switching products is navigation.
 */
const DEFAULT_URLS = {
  send: 'http://send.100-110-241-2.sslip.io',
  sign: 'http://sign-dev.100-110-241-2.sslip.io',
} as const;

type ProductId = keyof typeof DEFAULT_URLS;

const PRODUCTS: { id: ProductId; label: string; envKey: string }[] = [
  { id: 'send', label: 'Send', envKey: 'NEXT_PUBLIC_AMFORGE_SEND_URL' },
  { id: 'sign', label: 'Sign', envKey: 'NEXT_PUBLIC_AMFORGE_SIGN_URL' },
];

export type AmforgeProductSwitcherProps = {
  current: ProductId;
  className?: string;
};

export const AmforgeProductSwitcher = ({ current, className }: AmforgeProductSwitcherProps) => {
  return (
    <nav
      aria-label="AmForge products"
      className={cn('inline-flex h-8 items-center rounded-md bg-muted p-0.5 text-muted-foreground', className)}
    >
      {PRODUCTS.map((product) => {
        const isActive = product.id === current;

        return (
          <a
            key={product.id}
            href={isActive ? undefined : env(product.envKey) || DEFAULT_URLS[product.id]}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-7 items-center rounded-sm px-3 font-medium text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
            )}
          >
            {product.label}
          </a>
        );
      })}
    </nav>
  );
};
