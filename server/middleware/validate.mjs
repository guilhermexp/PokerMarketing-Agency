import { z } from "zod";

export function validateRequest(schemas = {}) {
  return (req, res, next) => {
    const { body, query, params } = schemas;

    const validations = [
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
        return res.status(400).json({
          error: "Validation failed",
          details: z.flattenError(result.error),
        });
      }

      req[key] = result.data;
    }

    next();
  };
}
