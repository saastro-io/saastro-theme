import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LocaleLink } from '@/i18n/utils';

interface Props {
  localeLinks: LocaleLink[];
}

export function LocaleSelector({ localeLinks }: Props) {
  if (localeLinks.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5" role="navigation" aria-label="Language">
      {localeLinks.map((link, i) => (
        <span key={link.locale} className="flex items-center">
          {i > 0 && (
            <span className="text-xs text-muted-foreground/40 mx-0.5">/</span>
          )}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 px-1.5 text-xs font-medium tracking-wider uppercase',
              link.isCurrent
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <a
              href={link.href}
              aria-current={link.isCurrent ? 'page' : undefined}
              aria-label={`Switch to ${link.label}`}
            >
              {link.label}
            </a>
          </Button>
        </span>
      ))}
    </div>
  );
}
