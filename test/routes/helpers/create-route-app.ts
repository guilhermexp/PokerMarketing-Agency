import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { errorHandler } from "../../../server/middleware/errorHandler.mjs";
import {
  isResponseEnvelope,
  sendError,
  sendSuccess,
} from "../../../server/lib/response.js";

export function createRouteApp(registerRoutes: (app: Express) => void) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    const rawJson = res.json.bind(res);
    // @ts-expect-error test-only extension
    res._rawJson = rawJson;

    res.json = ((payload: unknown) => {
      if (isResponseEnvelope(payload)) {
        return rawJson(payload);
      }

      if (
        res.statusCode >= 400 ||
        (payload && typeof payload === "object" && "error" in payload)
      ) {
        return sendError(res, payload);
      }

      return sendSuccess(res, payload);
    }) as typeof res.json;

    next();
  });

  registerRoutes(app);
  app.use(errorHandler);

  return app;
}
