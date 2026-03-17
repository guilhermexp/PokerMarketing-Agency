/**
 * Request Validation Middleware
 *
 * Validates request body, query, and params against Zod schemas.
 */

import type { Request, Response, NextFunction } from "express";
import { z, type ZodType } from "zod";

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

type ValidationTarget = "body" | "query" | "params";

/**
 * Creates a middleware that validates request data against Zod schemas.
 * If validation fails, returns 400 with error details.
 * If validation succeeds, replaces req.body/query/params with parsed data.
 */
export function validateRequest(schemas: ValidationSchemas = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { body, query, params } = schemas;

    const validations: Array<[ValidationTarget, ZodType | undefined, unknown]> = [
      ["body", body, req.body],
      ["query", query, req.query],
      ["params", params, req.params],
    ];

    for (const [key, schema, value] of validations) {
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(value);
      if (!result.success) {
        res.status(400).json({
          error: "Validation failed",
          details: z.flattenError(result.error),
        });
        return;
      }

      Object.defineProperty(req, key, {
        configurable: true,
        enumerable: true,
        value: result.data,
        writable: true,
      });
    }

    next();
  };
}
