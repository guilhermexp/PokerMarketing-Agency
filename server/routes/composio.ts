/**
 * Composio MCP Integration Routes.
 *
 * Endpoints for managing external app integrations via Composio.
 * All endpoints are protected by auth + CSRF middleware.
 */

import type { Express, Request, Response } from "express";
import { resolveUserId } from "../lib/user-resolver.js";
import { getSql } from "../lib/db.js";
import logger from "../lib/logger.js";
import { AppError } from "../lib/errors/index.js";
import { validateRequest } from "../middleware/validate.js";
import {
  createComposioProfile,
  listUserProfiles,
  deleteProfile,
  getProfileStatus,
  listToolkits,
  getToolkitDetails,
  listToolsForToolkit,
} from "../lib/composio/service.js";
import {
  createProfileBodySchema,
  listToolkitsQuerySchema,
  toolkitSlugParamsSchema,
  profileIdParamsSchema,
  type CreateProfileBody,
  type ListToolkitsQuery,
  type ToolkitSlugParams,
  type ProfileIdParams,
} from "../schemas/composio-schemas.js";

export function registerComposioRoutes(app: Express): void {
  // =========================================================================
  // TOOLKIT DISCOVERY
  // =========================================================================

  /**
   * GET /api/composio/toolkits
   * List available Composio toolkits (apps) with pagination and search.
   */
  app.get(
    "/api/composio/toolkits",
    validateRequest({ query: listToolkitsQuerySchema }),
    async (req: Request, res: Response) => {
      try {
        const { page, limit, search } = req.query as unknown as ListToolkitsQuery;
        const result = await listToolkits({ search, page, limit });
        res.json(result);
      } catch (error) {
        logger.error({ err: error }, "[Composio] Failed to list toolkits");
        throw new AppError("Failed to list toolkits", 500);
      }
    },
  );

  /**
   * GET /api/composio/toolkits/:slug
   * Get details for a specific toolkit.
   */
  app.get(
    "/api/composio/toolkits/:slug",
    validateRequest({ params: toolkitSlugParamsSchema }),
    async (req: Request, res: Response) => {
      try {
        const { slug } = req.params as unknown as ToolkitSlugParams;
        const toolkit = await getToolkitDetails(slug);
        res.json(toolkit);
      } catch (error) {
        logger.error({ err: error, slug: req.params.slug }, "[Composio] Failed to get toolkit details");
        throw new AppError("Toolkit not found", 404);
      }
    },
  );

  /**
   * GET /api/composio/tools/:slug
   * List available tools for a toolkit.
   */
  app.get(
    "/api/composio/tools/:slug",
    validateRequest({ params: toolkitSlugParamsSchema }),
    async (req: Request, res: Response) => {
      try {
        const { slug } = req.params as unknown as ToolkitSlugParams;
        const tools = await listToolsForToolkit(slug);
        res.json({ tools, count: tools.length });
      } catch (error) {
        logger.error({ err: error, slug: req.params.slug }, "[Composio] Failed to list tools");
        throw new AppError("Failed to list tools", 500);
      }
    },
  );

  // =========================================================================
  // PROFILE MANAGEMENT
  // =========================================================================

  /**
   * POST /api/composio/profiles
   * Create a new Composio profile (runs 6-step pipeline).
   * Returns redirect_url for OAuth popup.
   */
  app.post(
    "/api/composio/profiles",
    validateRequest({ body: createProfileBodySchema }),
    async (req: Request, res: Response) => {
      const sql = getSql();
      const authUserId = req.authSession?.user?.id ?? req.internalAuth?.userId;
      if (!authUserId) {
        throw new AppError("Authentication required", 401);
      }

      const resolvedUserId = await resolveUserId(sql, authUserId);
      if (!resolvedUserId) {
        throw new AppError("User not found", 404);
      }

      const { toolkit_slug, profile_name } = req.body as CreateProfileBody;

      try {
        const result = await createComposioProfile({
          userId: resolvedUserId,
          toolkitSlug: toolkit_slug,
          profileName: profile_name,
        });

        res.status(201).json({
          profile_id: result.profileId,
          redirect_url: result.redirectUrl,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { err: error, toolkit_slug, profile_name },
          "[Composio] Failed to create profile",
        );

        if (message.includes("duplicate key") || message.includes("unique constraint")) {
          throw new AppError(
            `Profile "${profile_name}" already exists for this toolkit`,
            409,
          );
        }

        throw new AppError(`Failed to create profile: ${message}`, 500);
      }
    },
  );

  /**
   * GET /api/composio/profiles
   * List all profiles for the authenticated user.
   */
  app.get("/api/composio/profiles", async (req: Request, res: Response) => {
    const sql = getSql();
    const authUserId = req.authSession?.user?.id ?? req.internalAuth?.userId;
    if (!authUserId) {
      throw new AppError("Authentication required", 401);
    }

    const resolvedUserId = await resolveUserId(sql, authUserId);
    if (!resolvedUserId) {
      throw new AppError("User not found", 404);
    }

    try {
      const profiles = await listUserProfiles(resolvedUserId);
      res.json({ profiles });
    } catch (error) {
      logger.error({ err: error }, "[Composio] Failed to list profiles");
      throw new AppError("Failed to list profiles", 500);
    }
  });

  /**
   * DELETE /api/composio/profiles/:id
   * Delete a profile.
   */
  app.delete(
    "/api/composio/profiles/:id",
    validateRequest({ params: profileIdParamsSchema }),
    async (req: Request, res: Response) => {
      const sql = getSql();
      const authUserId = req.authSession?.user?.id ?? req.internalAuth?.userId;
      if (!authUserId) {
        throw new AppError("Authentication required", 401);
      }

      const resolvedUserId = await resolveUserId(sql, authUserId);
      if (!resolvedUserId) {
        throw new AppError("User not found", 404);
      }

      const { id } = req.params as unknown as ProfileIdParams;
      const deleted = await deleteProfile(id, resolvedUserId);
      if (!deleted) {
        throw new AppError("Profile not found", 404);
      }

      res.json({ success: true });
    },
  );

  /**
   * GET /api/composio/profiles/:id/status
   * Check the connection status of a profile.
   */
  app.get(
    "/api/composio/profiles/:id/status",
    validateRequest({ params: profileIdParamsSchema }),
    async (req: Request, res: Response) => {
      const sql = getSql();
      const authUserId = req.authSession?.user?.id ?? req.internalAuth?.userId;
      if (!authUserId) {
        throw new AppError("Authentication required", 401);
      }

      const resolvedUserId = await resolveUserId(sql, authUserId);
      if (!resolvedUserId) {
        throw new AppError("User not found", 404);
      }

      const { id } = req.params as unknown as ProfileIdParams;

      try {
        const status = await getProfileStatus(id, resolvedUserId);
        res.json(status);
      } catch (error) {
        logger.error({ err: error, profileId: id }, "[Composio] Failed to check profile status");
        throw new AppError("Failed to check profile status", 500);
      }
    },
  );
}
