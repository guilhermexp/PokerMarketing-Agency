import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { getOpenApiDocument } from "../schemas/api-contracts.js";

export function registerApiDocs(app: Express): void {
  app.get("/api/openapi.json", (_req, res) => {
    res.json(getOpenApiDocument());
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(getOpenApiDocument(), {
      customSiteTitle: "Poker Marketing Agency API",
      explorer: true,
    }),
  );
}
