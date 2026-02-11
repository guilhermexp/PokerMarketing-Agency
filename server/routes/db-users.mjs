import { getSql } from "../lib/db.mjs";
import { ValidationError, DatabaseError } from "../lib/errors/index.mjs";

export function registerUserRoutes(app) {
  app.get("/api/db/users", async (req, res) => {
    try {
      const sql = getSql();
      const { email, id } = req.query;

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
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError("Failed to fetch user", error);
    }
  });

  app.post("/api/db/users", async (req, res) => {
    try {
      const sql = getSql();
      const { email, name, avatar_url, auth_provider, auth_provider_id } =
        req.body;

      if (!email || !name) {
        throw new ValidationError("email and name are required");
      }

      const existing =
        await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;

      if (existing.length > 0) {
        const updated = await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${existing[0].id} RETURNING *`;
        return res.json(updated[0]);
      }

      const result = await sql`
        INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
        VALUES (${email}, ${name}, ${avatar_url || null}, ${auth_provider || "email"}, ${auth_provider_id || null})
        RETURNING *
      `;

      res.status(201).json(result[0]);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError("Failed to create or update user", error);
    }
  });
}
