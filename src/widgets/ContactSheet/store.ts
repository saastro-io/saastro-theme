import { create } from 'zustand';

type ContactFormState = {
  isOpen: boolean;
  shouldLoad: boolean;
  openSheet: () => void;
  closeSheet: () => void;
};

export const useContactFormStore = create<ContactFormState>((set) => ({
  isOpen: false,
  shouldLoad: false,
  openSheet: () =>
    set((state) => ({
      shouldLoad: true,
      isOpen: true,
    })),
  closeSheet: () => set({ isOpen: false }),
}));
