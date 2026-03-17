import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { errorHandler } from "../../../server/middleware/errorHandler.js";
import { createResponseEnvelopeMiddleware } from "../../../server/lib/response-middleware.js";

export function createRouteApp(registerRoutes: (app: Express) => void) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use(createResponseEnvelopeMiddleware());

  registerRoutes(app);
  app.use(errorHandler);

  return app;
}
