import type { Express } from "express";
import { AppError, getSql } from "../lib/db.js";
import { ValidationError, DatabaseError } from "../lib/errors/index.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type UsersQuery,
  type UsersUpsertBody,
  usersQuerySchema,
  usersUpsertBodySchema,
} from "../schemas/users-schemas.js";

function toDatabaseError(error: unknown, message: string): DatabaseError {
  if (error instanceof Error) {
    return new DatabaseError(message, error);
  }
  return new DatabaseError(message);
}

export function registerUserRoutes(app: Express): void {
  app.get("/api/db/users", validateRequest({ query: usersQuerySchema }), async (req, res) => {
    try {
      const sql = getSql();
      const { email, id } = req.query as UsersQuery;

      if (id) {
        const result =
          await sql`SELECT * FROM users WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
        return res.json(result[0] || null);
      }

      if (email) {
        const result =
          await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
        return res.json(result[0] || null);
      }

      throw new ValidationError("email or id is required");
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw error;
      }
      throw toDatabaseError(error, "Failed to fetch user");
    }
  });

  app.post("/api/db/users", validateRequest({ body: usersUpsertBodySchema }), async (req, res) => {
    try {
      const sql = getSql();
      const { email, name, avatar_url, auth_provider, auth_provider_id } =
        req.body as UsersUpsertBody;

      const existing =
        await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;

      if (existing.length > 0) {
        const existingUser = existing[0]!;
        const updated = await sql`
          UPDATE users SET
            last_login_at = NOW(),
            auth_provider_id = COALESCE(${auth_provider_id}, auth_provider_id),
            auth_provider = COALESCE(${auth_provider}, auth_provider),
            name = COALESCE(${name}, name),
            avatar_url = COALESCE(${avatar_url}, avatar_url)
          WHERE id = ${existingUser.id} RETURNING *`;
        return res.json(updated[0]);
      }

      const result = await sql`
        INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
        VALUES (${email}, ${name}, ${avatar_url || null}, ${auth_provider || "email"}, ${auth_provider_id || null})
        RETURNING *
      `;

      res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw error;
      }
      throw toDatabaseError(error, "Failed to create or update user");
    }
  });
}
