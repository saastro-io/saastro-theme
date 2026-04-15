import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
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

export function DesktopMenu({ menu, currentPath = '' }: Props) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        {menu.map((item) => (
          <NavigationMenuItem key={item.url}>
            {item.items && item.items.length > 0 ? (
              <>
                <NavigationMenuTrigger
                  className={cn(item.items.some((s) => isActive(s.url, currentPath)) && 'text-foreground')}
                >
                  {item.title}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-48 gap-1 p-2">
                    {item.items.map((sub) => (
                      <li key={sub.url}>
                        <NavigationMenuLink asChild active={isActive(sub.url, currentPath)}>
                          <a href={sub.url} className="block rounded-md px-3 py-2 text-sm hover:bg-accent">
                            <span className="font-medium">{sub.title}</span>
                            {sub.description && (
                              <span className="block text-xs text-muted-foreground">{sub.description}</span>
                            )}
                          </a>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </>
            ) : (
              <NavigationMenuLink asChild active={isActive(item.url, currentPath)}>
                <a href={item.url} className={navigationMenuTriggerStyle()}>
                  {item.title}
                </a>
              </NavigationMenuLink>
            )}
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
