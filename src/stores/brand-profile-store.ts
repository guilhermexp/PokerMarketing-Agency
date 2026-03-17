import { create } from "zustand";
import type { BrandProfile, CreativeModel } from "@/types";

interface BrandProfileStore {
  brandProfile: BrandProfile | null;
  isEditingProfile: boolean;
  showOnboarding: boolean;
  setBrandProfile: (brandProfile: BrandProfile | null) => void;
  hydrateBrandProfile: (brandProfile: BrandProfile | null) => void;
  clearBrandProfile: () => void;
  setIsEditingProfile: (isEditingProfile: boolean) => void;
  setShowOnboarding: (showOnboarding: boolean) => void;
  updateCreativeModel: (creativeModel: CreativeModel) => void;
}

export const useBrandProfileStore = create<BrandProfileStore>((set) => ({
  brandProfile: null,
  isEditingProfile: false,
  showOnboarding: true,
  setBrandProfile: (brandProfile) => set({ brandProfile }),
  hydrateBrandProfile: (brandProfile) =>
    set((state) => ({
      brandProfile,
      showOnboarding: brandProfile ? false : state.showOnboarding,
    })),
  clearBrandProfile: () => set({ brandProfile: null }),
  setIsEditingProfile: (isEditingProfile) => set({ isEditingProfile }),
  setShowOnboarding: (showOnboarding) => set({ showOnboarding }),
  updateCreativeModel: (creativeModel) =>
    set((state) => ({
      brandProfile: state.brandProfile
        ? { ...state.brandProfile, creativeModel }
        : null,
    })),
}));
