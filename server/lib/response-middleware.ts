import type { NextFunction, Request, Response } from "express";
import { validateRouteOutput } from "../schemas/api-contracts.js";
import { isResponseEnvelope, sendError, sendSuccess } from "./response.js";

type RequestWithRoute = Request & {
  route?: {
    path?: string | RegExp | Array<string | RegExp>;
  };
};

function getRoutePath(req: RequestWithRoute): string | null {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl}${routePath}`;
  }

  if (Array.isArray(routePath) && typeof routePath[0] === "string") {
    return `${req.baseUrl}${routePath[0]}`;
  }

  return null;
}

export function createResponseEnvelopeMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawJson = res.json.bind(res);

    Object.defineProperty(res, "_rawJson", {
      configurable: true,
      enumerable: false,
      value: rawJson,
      writable: true,
    });

    Object.defineProperty(res, "sendSuccess", {
      configurable: true,
      enumerable: false,
      value: (data: unknown, meta?: Record<string, unknown> | null) =>
        sendSuccess(res, data, meta),
      writable: true,
    });

    Object.defineProperty(res, "sendError", {
      configurable: true,
      enumerable: false,
      value: (error: unknown) => sendError(res, error),
      writable: true,
    });

    res.json = ((payload: unknown) => {
      if (res.locals.skipResponseEnvelope || isResponseEnvelope(payload)) {
        return rawJson(payload);
      }

      if (
        res.statusCode >= 400 ||
        (payload && typeof payload === "object" && "error" in payload)
      ) {
        return sendError(res, payload);
      }

      const routePath = getRoutePath(req as RequestWithRoute);
      const validatedPayload = routePath
        ? validateRouteOutput(req.method, routePath, payload)
        : payload;

      return sendSuccess(res, validatedPayload);
    }) as typeof res.json;

    next();
  };
}
