import { clientLogger } from "@/lib/client-logger";
/**
 * Brand Profile Handlers Hook
 *
 * Manages brand profile operations:
 * - Updating creative model preference
 */

import { useCallback } from "react";
import type { BrandProfile, CreativeModel } from "@/types";
import { getBrandProfile, updateBrandProfile } from "@/services/apiClient";

// =============================================================================
// Types
// =============================================================================

interface UseBrandProfileHandlersParams {
  userId: string | null;
  organizationId: string | null;
  brandProfile: BrandProfile | null;
  setBrandProfile: (profile: BrandProfile) => void;
}

interface BrandProfileHandlers {
  handleUpdateCreativeModel: (model: CreativeModel) => Promise<void>;
  handleEditProfile: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useBrandProfileHandlers({
  userId,
  organizationId,
  brandProfile,
  setBrandProfile,
}: UseBrandProfileHandlersParams & {
  setIsEditingProfile: (editing: boolean) => void;
}): BrandProfileHandlers {
  const handleUpdateCreativeModel = useCallback(
    async (model: CreativeModel) => {
      if (brandProfile) {
        setBrandProfile({ ...brandProfile, creativeModel: model });
      }
      if (userId) {
        try {
          const existingProfile = await getBrandProfile(userId, organizationId);
          if (existingProfile) {
            await updateBrandProfile(existingProfile.id, {
              settings: {
                ...existingProfile.settings,
                creativeModel: model,
              },
            });
            clientLogger.debug("[BrandProfile] Creative model updated to:", model);
          }
        } catch (e) {
          clientLogger.error("Failed to update creative model:", e);
        }
      }
    },
    [brandProfile, organizationId, setBrandProfile, userId]
  );

  const handleEditProfile = useCallback(() => {
    // This is handled inline in the component since it just sets state
    // The actual implementation is passed via setIsEditingProfile
  }, []);

  return {
    handleUpdateCreativeModel,
    handleEditProfile,
  };
}

// =============================================================================
// Simple Hook (no setIsEditingProfile dependency)
// =============================================================================

export function useCreativeModelHandler({
  userId,
  organizationId,
  brandProfile,
  setBrandProfile,
}: UseBrandProfileHandlersParams): {
  handleUpdateCreativeModel: (model: CreativeModel) => Promise<void>;
} {
  const handleUpdateCreativeModel = useCallback(
    async (model: CreativeModel) => {
      if (brandProfile) {
        setBrandProfile({ ...brandProfile, creativeModel: model });
      }
      if (userId) {
        try {
          const existingProfile = await getBrandProfile(userId, organizationId);
          if (existingProfile) {
            await updateBrandProfile(existingProfile.id, {
              settings: {
                ...existingProfile.settings,
                creativeModel: model,
              },
            });
            clientLogger.debug("[BrandProfile] Creative model updated to:", model);
          }
        } catch (e) {
          clientLogger.error("Failed to update creative model:", e);
        }
      }
    },
    [brandProfile, organizationId, setBrandProfile, userId]
  );

  return {
    handleUpdateCreativeModel,
  };
}
