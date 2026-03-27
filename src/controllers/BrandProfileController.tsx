import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BrandProfileSetup } from "@/components/brand/BrandProfileSetup";
import { useAuth } from "@/components/auth/AuthWrapper";
import { useCreativeModelHandler } from "@/hooks/useBrandProfileHandlers";
import { authClient, getOrganizationApi } from "@/lib/auth-client";
import { clientLogger } from "@/lib/client-logger";
import { useInitialData } from "@/hooks/useAppData";
import { createBrandProfile, getBrandProfile, updateBrandProfile } from "@/services/apiClient";
import { useBrandProfileStore } from "@/stores/brand-profile-store";
import { useUiStore } from "@/stores/uiStore";
import type { BrandProfile, CreativeModel, Theme } from "@/types";
import type { ViewType } from "@/main-app-controller";

const VIEW_PATHS: Record<ViewType, string> = {
  campaign: "/campaign",
  campaigns: "/campaigns",
  carousels: "/carousels",
  flyer: "/flyer",
  gallery: "/gallery",
  calendar: "/calendar",
  playground: "/playground",
  "image-playground": "/image-playground",
  integrations: "/integrations",
};

interface BrandProfileControllerValue {
  routeView: ViewType;
  onViewChange: (view: ViewType) => void;
  userId: string | null;
  clerkUserId: string | null;
  organizationId: string | null;
  brandProfile: BrandProfile | null;
  isEditingProfile: boolean;
  setIsEditingProfile: (editing: boolean) => void;
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  theme: Theme;
  handleThemeToggle: () => void;
  isAppLoading: boolean;
  submitBrandProfile: (profile: BrandProfile) => Promise<void>;
  saveBrandProfile: (profile: BrandProfile) => Promise<void>;
  handleUpdateCreativeModel: (model: CreativeModel) => Promise<void>;
  handleEditProfile: () => void;
}

const BrandProfileControllerContext =
  createContext<BrandProfileControllerValue | null>(null);

interface BrandProfileControllerProps {
  children: ReactNode;
  routeView: ViewType;
}

export function BrandProfileController({
  children,
  routeView,
}: BrandProfileControllerProps) {
  const navigate = useNavigate();
  const { userId, clerkUserId, isLoading: authLoading, isOrgReady } = useAuth();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id || null;

  const skipBrandClearOnOrgSwitch = useRef(false);
  const contextRef = useRef({ userId, organizationId });
  const hasInitialDataLoadedOnce = useRef(false);

  const brandProfile = useBrandProfileStore((state) => state.brandProfile);
  const setBrandProfile = useBrandProfileStore((state) => state.setBrandProfile);
  const clearBrandProfile = useBrandProfileStore((state) => state.clearBrandProfile);
  const isEditingProfile = useBrandProfileStore((state) => state.isEditingProfile);
  const setIsEditingProfile = useBrandProfileStore((state) => state.setIsEditingProfile);
  const showOnboarding = useBrandProfileStore((state) => state.showOnboarding);
  const setShowOnboarding = useBrandProfileStore((state) => state.setShowOnboarding);

  const error = useUiStore((state) => state.error);
  const setError = useUiStore((state) => state.setError);
  const theme = useUiStore((state) => state.theme);
  const handleThemeToggle = useUiStore((state) => state.toggleTheme);

  const { data: initialData, isLoading: isInitialLoading } = useInitialData(
    isOrgReady ? clerkUserId : null,
    organizationId,
    clerkUserId
  );

  const onViewChange = useCallback(
    (view: ViewType) => navigate(VIEW_PATHS[view]),
    [navigate]
  );

  const isContextChanging =
    contextRef.current.userId !== userId ||
    contextRef.current.organizationId !== organizationId;
  const isInitialMount = !hasInitialDataLoadedOnce.current && !initialData;

  useEffect(() => {
    if (skipBrandClearOnOrgSwitch.current) {
      skipBrandClearOnOrgSwitch.current = false;
      return;
    }

    clearBrandProfile();
  }, [clearBrandProfile, userId, organizationId]);

  useEffect(() => {
    if (!initialData) return;

    hasInitialDataLoadedOnce.current = true;
    contextRef.current = { userId, organizationId };

    if (initialData.brandProfile && !brandProfile) {
      const dbProfile = initialData.brandProfile;
      setBrandProfile({
        name: dbProfile.name,
        description: dbProfile.description || "",
        logo: dbProfile.logo_url || null,
        primaryColor: dbProfile.primary_color,
        secondaryColor: dbProfile.secondary_color,
        tertiaryColor: dbProfile.tertiary_color || "",
        toneOfVoice: dbProfile.tone_of_voice as BrandProfile["toneOfVoice"],
        toneTargets: dbProfile.settings?.toneTargets as BrandProfile["toneTargets"],
        creativeModel: dbProfile.settings?.creativeModel as BrandProfile["creativeModel"],
      });
    }
  }, [initialData, brandProfile, userId, organizationId, setBrandProfile]);

  const submitBrandProfile = useCallback(
    async (profile: BrandProfile) => {
      setBrandProfile(profile);

      if (!userId) return;

      try {
        let newOrgId = organizationId;

        if (!newOrgId) {
          const slug = profile.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          const response = await getOrganizationApi().create({
            name: profile.name.trim(),
            slug,
          });
          if (response.data?.id) {
            newOrgId = response.data.id;
          }
        }

        if (newOrgId && newOrgId !== organizationId) {
          skipBrandClearOnOrgSwitch.current = true;
          await getOrganizationApi().setActive({ organizationId: newOrgId });
        }

        await createBrandProfile(userId, {
          name: profile.name,
          description: profile.description,
          logo_url: profile.logo || undefined,
          primary_color: profile.primaryColor,
          secondary_color: profile.secondaryColor,
          tertiary_color: profile.tertiaryColor,
          tone_of_voice: profile.toneOfVoice,
        });
      } catch (saveError) {
        clientLogger.error("Failed to save brand profile:", saveError);
      }
    },
    [organizationId, setBrandProfile, userId]
  );

  const saveBrandProfile = useCallback(
    async (profile: BrandProfile) => {
      setBrandProfile(profile);

      if (!userId) return;

      try {
        const existingProfile = await getBrandProfile(userId, organizationId);
        if (!existingProfile) return;

        await updateBrandProfile(existingProfile.id, {
          name: profile.name,
          description: profile.description,
          logo_url: profile.logo || undefined,
          primary_color: profile.primaryColor,
          secondary_color: profile.secondaryColor,
          tertiary_color: profile.tertiaryColor,
          tone_of_voice: profile.toneOfVoice,
          settings: {
            ...existingProfile.settings,
            toneTargets: profile.toneTargets,
            creativeModel: profile.creativeModel,
          },
        });
      } catch (saveError) {
        clientLogger.error("Failed to update brand profile:", saveError);
      }
    },
    [organizationId, setBrandProfile, userId]
  );

  const handleEditProfile = useCallback(() => {
    setIsEditingProfile(true);
  }, [setIsEditingProfile]);

  const { handleUpdateCreativeModel } = useCreativeModelHandler({
    userId,
    organizationId,
    brandProfile,
    setBrandProfile,
  });

  // Keep showing the loader until we know for sure whether the user has a
  // brand profile.  Three situations must be covered:
  //   1. Auth / org / initial-data still loading → obvious loading state
  //   2. initialData arrived with a brand profile but the store hasn't been
  //      hydrated yet (the useEffect that calls setBrandProfile runs *after*
  //      this render)
  //   3. Context (user/org) just changed → stale data, wait for refresh
  //   4. The clear-on-org-switch effect ran but the hydration effect hasn't
  //      re-populated the store yet — without this guard the UI briefly
  //      flashes the brand-creation screen.
  const isAppLoading =
    authLoading ||
    isInitialLoading ||
    !isOrgReady ||
    !initialData ||
    !!(initialData.brandProfile && !brandProfile) ||
    isContextChanging ||
    isInitialMount;

  const value = useMemo<BrandProfileControllerValue>(
    () => ({
      routeView,
      onViewChange,
      userId,
      clerkUserId,
      organizationId,
      brandProfile,
      isEditingProfile,
      setIsEditingProfile,
      showOnboarding,
      setShowOnboarding,
      error,
      setError,
      theme,
      handleThemeToggle,
      isAppLoading,
      submitBrandProfile,
      saveBrandProfile,
      handleUpdateCreativeModel,
      handleEditProfile,
    }),
    [
      routeView,
      onViewChange,
      userId,
      clerkUserId,
      organizationId,
      brandProfile,
      isEditingProfile,
      setIsEditingProfile,
      showOnboarding,
      setShowOnboarding,
      error,
      setError,
      theme,
      handleThemeToggle,
      isAppLoading,
      submitBrandProfile,
      saveBrandProfile,
      handleUpdateCreativeModel,
      handleEditProfile,
    ]
  );

  return (
    <BrandProfileControllerContext.Provider value={value}>
      {children}
    </BrandProfileControllerContext.Provider>
  );
}

export function useBrandProfileController() {
  const context = useContext(BrandProfileControllerContext);

  if (!context) {
    throw new Error(
      "useBrandProfileController must be used within BrandProfileController"
    );
  }

  return context;
}

export { BrandProfileSetup };
