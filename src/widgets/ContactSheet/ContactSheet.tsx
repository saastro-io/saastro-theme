import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useContactFormStore } from './store';

const ContactSheet = () => {
  const { isOpen, openSheet, closeSheet } = useContactFormStore();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? openSheet() : closeSheet())}>
      <SheetContent className="flex flex-col h-full gap-0">
        <SheetHeader className="border-b pb-4">
          <SheetTitle>Contact Us</SheetTitle>
          <SheetDescription>
            Fill in the form below and we'll get back to you as soon as possible.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 p-4">
          {/* Drop your form component here */}
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Form coming soon.</p>
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-3">
          <p className="text-xs text-muted-foreground">
            We will use your details based on legitimate interest as stated in our{' '}
            <a href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
          <Button type="submit" form="contact-form" className="w-full">
            Send
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactSheet;
