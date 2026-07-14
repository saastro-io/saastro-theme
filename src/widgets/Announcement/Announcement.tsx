import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { editableField, editableSection } from '@saastro/studio/markers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface AnnouncementProps {
  text?: string;
  badge?: string;
  href?: string;
  buttonText?: string;
  buttonHref?: string;
  persistClose?: boolean;
  className?: string;
  /** Studio section key — the marker maps fields to the `<fieldPrefix>` i18n
      namespace (text → `<fieldPrefix>.text`, badge → `<fieldPrefix>.badge`). */
  fieldPrefix?: string;
}

export function Announcement({
  text = 'Welcome to Saastro Theme',
  badge = 'NEW',
  href,
  buttonText,
  buttonHref,
  persistClose = true,
  className,
  fieldPrefix = 'announcement',
}: AnnouncementProps) {
  // Stable key so the dismissed state actually persists across loads. (The
  // previous `useId()` key changed every render → dismiss never stuck.)
  const storageKey = 'announcement-dismissed';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (persistClose && localStorage.getItem(storageKey) === 'hidden') return;
    setVisible(true);
  }, [persistClose]);

  const dismiss = () => {
    if (persistClose) localStorage.setItem(storageKey, 'hidden');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      {...editableSection(fieldPrefix)}
      className={cn(
        'flex items-center justify-center gap-3 border-b bg-muted/60 px-4 py-2 text-sm',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      {badge && (
        <Badge variant="secondary" className="shrink-0 text-xs" {...editableField('badge')}>
          {badge}
        </Badge>
      )}

      <span className="text-muted-foreground truncate" {...editableField('text')}>
        {href ? (
          <a href={href} className="hover:text-foreground underline underline-offset-4 transition-colors">
            {text}
          </a>
        ) : (
          text
        )}
      </span>

      {buttonText && buttonHref && (
        <Button asChild size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs">
          <a href={buttonHref}>{buttonText}</a>
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="ml-auto h-6 w-6 shrink-0"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
