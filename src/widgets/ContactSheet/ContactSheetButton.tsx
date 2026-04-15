import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import { useContactFormStore } from './store';

interface ContactSheetButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  content?: string;
}

export function ContactSheetButton({
  variant = 'default',
  size = 'default',
  content = 'Contact Us',
  className,
  ...rest
}: ContactSheetButtonProps) {
  const { openSheet } = useContactFormStore();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      openSheet();
    },
    [openSheet],
  );

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      {...rest}
    >
      {content}
    </Button>
  );
}
