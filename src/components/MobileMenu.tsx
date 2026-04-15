import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

export interface MenuItem {
  title: string;
  url: string;
  description?: string;
  items?: MenuItem[];
}

interface Props {
  menu: MenuItem[];
  currentPath?: string;
}

function isActive(url: string, current: string) {
  const norm = (p: string) => p.replace(/\/$/, '').split('?')[0];
  return norm(current).startsWith(norm(url));
}

export function MobileMenu({ menu, currentPath = '' }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-4 p-4">
          <Accordion type="single" collapsible className="w-full">
            {menu.map((item) =>
              item.items && item.items.length > 0 ? (
                <AccordionItem key={item.url} value={item.title} className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                    {item.title}
                  </AccordionTrigger>
                  <AccordionContent className="pb-1">
                    <div className="flex flex-col gap-1">
                      {item.items.map((sub) => (
                        <a
                          key={sub.url}
                          href={sub.url}
                          className={cn(
                            'rounded-md px-3 py-2 text-sm transition-colors',
                            isActive(sub.url, currentPath)
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-muted',
                          )}
                        >
                          <span className="font-medium">{sub.title}</span>
                          {sub.description && (
                            <span className="block text-xs text-muted-foreground">{sub.description}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ) : (
                <a
                  key={item.url}
                  href={item.url}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.url, currentPath)
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {item.title}
                </a>
              ),
            )}
          </Accordion>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
